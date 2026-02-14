import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  VoiceBackend,
  VoiceEvent,
  VoiceRuntimeOptions,
  VoiceRuntimeOptionsUpdate,
  VoiceStatus
} from "../../shared/contracts";
import { Logger } from "./logger";

const requireFromHere = createRequire(__filename);
const execFileAsync = promisify(execFile);

interface VoiceServiceOptions {
  enabled?: boolean;
  wakeWord?: string;
  whisperCliPath?: string;
  whisperModelPath?: string;
  wakeRmsThreshold?: number;
  wakeRequiredHits?: number;
  wakeCooldownMs?: number;
  commandWindowMs?: number;
  onCommand: (command: string) => Promise<string | void>;
  onEvent?: (event: VoiceEvent) => void;
}

interface AudioChunk {
  base64Audio: string;
  mimeType: string;
}

interface TempAudio {
  tempDir: string;
  audioPath: string;
  outputBasePath: string;
}

interface WavMeta {
  audioFormat: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

type UnknownRecord = Record<string, unknown>;

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");
const toFiniteOr = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const pickResultText = (value: unknown): string | null => {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as UnknownRecord;
  const direct = record.text;
  if (typeof direct === "string") {
    return normalizeText(direct);
  }

  const transcribed = record.transcript;
  if (typeof transcribed === "string") {
    return normalizeText(transcribed);
  }

  const nested = record.result;
  if (typeof nested === "string") {
    return normalizeText(nested);
  }

  return null;
};

const parseWavMeta = (buffer: Buffer): WavMeta | null => {
  if (buffer.length < 44) {
    return null;
  }

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let audioFormat = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8;

    if (offset + chunkSize > buffer.length) {
      break;
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        return null;
      }
      audioFormat = buffer.readUInt16LE(offset);
      bitsPerSample = buffer.readUInt16LE(offset + 14);
    }

    if (chunkId === "data") {
      dataOffset = offset;
      dataSize = chunkSize;
      break;
    }

    offset += chunkSize;
    if (chunkSize % 2 === 1) {
      offset += 1;
    }
  }

  if (dataOffset < 0 || dataSize <= 0) {
    return null;
  }

  return {
    audioFormat,
    bitsPerSample,
    dataOffset,
    dataSize: Math.min(dataSize, buffer.length - dataOffset)
  };
};

const rmsFromPcm16Wav = (buffer: Buffer): number | null => {
  const meta = parseWavMeta(buffer);
  if (!meta || meta.audioFormat !== 1 || meta.bitsPerSample !== 16) {
    return null;
  }

  const sampleCount = Math.floor(meta.dataSize / 2);
  if (sampleCount <= 0) {
    return null;
  }

  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const raw = buffer.readInt16LE(meta.dataOffset + index * 2);
    const normalized = raw / 32768;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / sampleCount);
};

/**
 * Offline voice orchestration service using local wake-onset gating and local STT backends.
 */
export class VoiceService {
  private readonly logger = new Logger();
  private wakeWord: string;
  private readonly onCommand: (command: string) => Promise<string | void>;
  private readonly onEvent?: (event: VoiceEvent) => void;
  private whisperCliPath?: string;
  private whisperModelPath?: string;

  private wakeRmsThreshold: number;
  private wakeRequiredHits: number;
  private wakeCooldownMs: number;
  private commandWindowMs: number;

  private enabled = false;
  private processing = false;
  private commandWindowUntil = 0;
  private chunkQueue: AudioChunk[] = [];
  private wakeHits = 0;
  private lastWakeAtMs = 0;

  private status: VoiceStatus;
  private backend: VoiceBackend = "stub";
  private whisperAddon: unknown | null | undefined;

  constructor(options: VoiceServiceOptions) {
    this.wakeWord = normalizeText(options.wakeWord ?? "jarvis").toLowerCase();
    this.onCommand = options.onCommand;
    this.onEvent = options.onEvent;
    this.whisperCliPath = options.whisperCliPath ?? process.env.JARVIS_WHISPER_CPP;
    this.whisperModelPath = options.whisperModelPath ?? process.env.JARVIS_WHISPER_MODEL;

    this.wakeRmsThreshold = Math.max(
      0.001,
      Math.min(1, toFiniteOr(options.wakeRmsThreshold ?? process.env.JARVIS_WAKE_RMS, 0.045))
    );
    this.wakeRequiredHits = Math.max(
      1,
      toFiniteOr(options.wakeRequiredHits ?? process.env.JARVIS_WAKE_HITS, 2)
    );
    this.wakeCooldownMs = Math.max(
      500,
      toFiniteOr(options.wakeCooldownMs ?? process.env.JARVIS_WAKE_COOLDOWN_MS, 3500)
    );
    this.commandWindowMs = Math.max(
      1500,
      toFiniteOr(options.commandWindowMs ?? process.env.JARVIS_COMMAND_WINDOW_MS, 7000)
    );

    this.status = {
      enabled: Boolean(options.enabled),
      listening: Boolean(options.enabled),
      wakeWord: this.wakeWord,
      backend: "stub",
      pendingAudioChunks: 0
    };
    this.enabled = this.status.enabled;
  }

  /**
   * Detects best available local transcription backend.
   */
  async init(): Promise<void> {
    await this.detectBackend();
    this.emitStatus();
  }

  destroy(): void {
    this.enabled = false;
    this.processing = false;
    this.commandWindowUntil = 0;
    this.chunkQueue = [];
    this.wakeHits = 0;
    this.lastWakeAtMs = 0;
    this.status.enabled = false;
    this.status.listening = false;
    this.status.pendingAudioChunks = 0;
    this.emitStatus();
  }

  getStatus(): VoiceStatus {
    return { ...this.status };
  }

  getConfig(): VoiceRuntimeOptions {
    return {
      enabled: this.enabled,
      wakeWord: this.wakeWord,
      wakeRmsThreshold: this.wakeRmsThreshold,
      wakeRequiredHits: this.wakeRequiredHits,
      wakeCooldownMs: this.wakeCooldownMs,
      commandWindowMs: this.commandWindowMs,
      whisperCliPath: this.whisperCliPath,
      whisperModelPath: this.whisperModelPath
    };
  }

  async configure(updates: VoiceRuntimeOptionsUpdate): Promise<VoiceStatus> {
    if (updates.wakeWord !== undefined) {
      this.wakeWord = normalizeText(updates.wakeWord).toLowerCase() || this.wakeWord;
      this.status.wakeWord = this.wakeWord;
    }

    if (updates.wakeRmsThreshold !== undefined) {
      this.wakeRmsThreshold = Math.max(0.001, Math.min(1, toFiniteOr(updates.wakeRmsThreshold, 0.045)));
    }

    if (updates.wakeRequiredHits !== undefined) {
      this.wakeRequiredHits = Math.max(1, Math.round(toFiniteOr(updates.wakeRequiredHits, this.wakeRequiredHits)));
    }

    if (updates.wakeCooldownMs !== undefined) {
      this.wakeCooldownMs = Math.max(500, Math.round(toFiniteOr(updates.wakeCooldownMs, this.wakeCooldownMs)));
    }

    if (updates.commandWindowMs !== undefined) {
      this.commandWindowMs = Math.max(
        1500,
        Math.round(toFiniteOr(updates.commandWindowMs, this.commandWindowMs))
      );
    }

    if (updates.whisperCliPath !== undefined) {
      const next = normalizeText(updates.whisperCliPath);
      this.whisperCliPath = next || undefined;
    }

    if (updates.whisperModelPath !== undefined) {
      const next = normalizeText(updates.whisperModelPath);
      this.whisperModelPath = next || undefined;
    }

    if (updates.enabled !== undefined) {
      await this.setEnabled(updates.enabled);
    }

    await this.detectBackend();
    this.emitStatus();
    return this.getStatus();
  }

  async setEnabled(enabled: boolean): Promise<VoiceStatus> {
    this.enabled = enabled;
    this.status.enabled = enabled;
    this.status.listening = enabled;
    this.status.lastError = undefined;

    if (!enabled) {
      this.commandWindowUntil = 0;
      this.chunkQueue = [];
      this.status.pendingAudioChunks = 0;
      this.wakeHits = 0;
    }

    this.emitStatus();
    return this.getStatus();
  }

  async pushAudio(base64Audio: string, mimeType = "audio/wav"): Promise<VoiceStatus> {
    if (!this.enabled) {
      return this.getStatus();
    }

    this.chunkQueue.push({ base64Audio, mimeType });
    this.status.pendingAudioChunks = this.chunkQueue.length;
    this.emitStatus();

    if (!this.processing) {
      void this.drainQueue();
    }

    return this.getStatus();
  }

  async simulateTranscript(rawTranscript: string): Promise<VoiceStatus> {
    const transcript = normalizeText(rawTranscript);
    if (!transcript) {
      return this.getStatus();
    }

    const lower = transcript.toLowerCase();
    const wakeIndex = lower.indexOf(this.wakeWord);

    if (wakeIndex >= 0) {
      const afterWake = normalizeText(transcript.slice(wakeIndex + this.wakeWord.length));
      const now = Date.now();
      this.armCommandWindow(now);

      if (afterWake) {
        await this.processCommandTranscript(afterWake);
      }
      return this.getStatus();
    }

    if (Date.now() < this.commandWindowUntil) {
      await this.processCommandTranscript(transcript);
    }

    return this.getStatus();
  }

  private async drainQueue(): Promise<void> {
    this.processing = true;

    while (this.enabled && this.chunkQueue.length > 0) {
      const next = this.chunkQueue.shift();
      if (!next) {
        continue;
      }

      this.status.pendingAudioChunks = this.chunkQueue.length;

      try {
        const audioBuffer = Buffer.from(next.base64Audio, "base64");
        if (audioBuffer.length === 0) {
          continue;
        }

        const now = Date.now();
        const inCommandWindow = now < this.commandWindowUntil;

        if (!inCommandWindow) {
          const wakeDetected = this.detectWakeOnset(audioBuffer, now);
          if (wakeDetected) {
            this.armCommandWindow(now);
          }
          continue;
        }

        const transcript = await this.transcribeAudio(audioBuffer, next.mimeType);
        if (transcript) {
          await this.processCommandTranscript(transcript);
        }
      } catch (error) {
        this.setError(`Voice chunk processing failed: ${getErrorMessage(error)}`);
      }
    }

    this.processing = false;
    this.status.pendingAudioChunks = this.chunkQueue.length;
    this.emitStatus();
  }

  private detectWakeOnset(audioBuffer: Buffer, nowMs: number): boolean {
    if (nowMs - this.lastWakeAtMs < this.wakeCooldownMs) {
      return false;
    }

    const rms = rmsFromPcm16Wav(audioBuffer);
    if (rms === null) {
      this.wakeHits = 0;
      return false;
    }

    if (rms >= this.wakeRmsThreshold) {
      this.wakeHits += 1;
    } else {
      this.wakeHits = Math.max(0, this.wakeHits - 1);
    }

    if (this.wakeHits < this.wakeRequiredHits) {
      return false;
    }

    this.wakeHits = 0;
    this.lastWakeAtMs = nowMs;
    return true;
  }

  private armCommandWindow(nowMs: number): void {
    this.commandWindowUntil = nowMs + this.commandWindowMs;
    this.status.lastWakeAtIso = new Date(nowMs).toISOString();
    this.emitEvent({
      type: "wake",
      atIso: new Date(nowMs).toISOString(),
      message: "Wake trigger detected.",
      status: this.getStatus()
    });
    this.emitStatus();
  }

  private async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    const addonTranscript = await this.tryWhisperAddon(audioBuffer, mimeType);
    if (addonTranscript) {
      return addonTranscript;
    }

    const cliTranscript = await this.tryWhisperCli(audioBuffer, mimeType);
    if (cliTranscript) {
      return cliTranscript;
    }

    return null;
  }

  private async processCommandTranscript(rawTranscript: string): Promise<void> {
    const transcript = normalizeText(rawTranscript);
    if (!transcript) {
      return;
    }

    this.status.lastTranscript = transcript;
    this.emitStatus();

    const lower = transcript.toLowerCase();
    const command = lower.startsWith(this.wakeWord)
      ? normalizeText(transcript.slice(this.wakeWord.length))
      : transcript;

    if (!command) {
      return;
    }

    await this.dispatchCommand(command, transcript);
    this.commandWindowUntil = 0;
  }

  private async dispatchCommand(command: string, transcript: string): Promise<void> {
    const cleanCommand = normalizeText(command);
    if (!cleanCommand) {
      return;
    }

    try {
      const resultMessage = await this.onCommand(cleanCommand);
      const message = typeof resultMessage === "string" ? resultMessage : undefined;
      this.emitEvent({
        type: "command",
        atIso: new Date().toISOString(),
        transcript,
        command: cleanCommand,
        message,
        status: this.getStatus()
      });
    } catch (error) {
      this.setError(`Voice command failed: ${getErrorMessage(error)}`);
    }
  }

  private async detectBackend(): Promise<void> {
    if (this.loadWhisperAddon()) {
      this.backend = "whisper-node-addon";
    } else if (this.whisperCliPath && this.whisperModelPath && existsSync(this.whisperCliPath)) {
      this.backend = "whisper.cpp-cli";
    } else {
      this.backend = "stub";
    }

    this.status.backend = this.backend;
  }

  private loadWhisperAddon(): unknown | null {
    if (this.whisperAddon !== undefined) {
      return this.whisperAddon;
    }

    try {
      this.whisperAddon = requireFromHere("whisper-node-addon");
      return this.whisperAddon;
    } catch {
      this.whisperAddon = null;
      return null;
    }
  }

  private async tryWhisperAddon(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    const addon = this.loadWhisperAddon();
    if (!addon) {
      return null;
    }

    const addonRecord = addon as UnknownRecord;
    const maybeDefault = addonRecord.default;
    const defaultRecord =
      maybeDefault && typeof maybeDefault === "object" ? (maybeDefault as UnknownRecord) : undefined;

    const fnCandidates: unknown[] = [
      addonRecord.transcribe,
      addonRecord.whisper,
      defaultRecord?.transcribe,
      defaultRecord
    ];

    const transcribeFn = fnCandidates.find((entry) => typeof entry === "function");
    if (typeof transcribeFn !== "function") {
      return null;
    }

    const tempAudio = await this.writeTempAudio(audioBuffer, mimeType);

    try {
      const result = await Promise.resolve(
        (transcribeFn as (path: string, options?: UnknownRecord) => unknown)(tempAudio.audioPath, {
          model: this.whisperModelPath,
          language: "en"
        })
      );
      const text = pickResultText(result);
      if (text) {
        this.status.backend = "whisper-node-addon";
        return text;
      }
      return null;
    } catch {
      return null;
    } finally {
      await this.disposeTempAudio(tempAudio);
    }
  }

  private async tryWhisperCli(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    if (!this.whisperCliPath || !this.whisperModelPath || !existsSync(this.whisperCliPath)) {
      return null;
    }

    const tempAudio = await this.writeTempAudio(audioBuffer, mimeType);

    try {
      await execFileAsync(
        this.whisperCliPath,
        ["-m", this.whisperModelPath, "-f", tempAudio.audioPath, "-nt", "-of", tempAudio.outputBasePath],
        { windowsHide: true }
      );

      const textPath = `${tempAudio.outputBasePath}.txt`;
      if (!existsSync(textPath)) {
        return null;
      }

      const output = await readFile(textPath, "utf8");
      const transcript = normalizeText(output);
      if (!transcript) {
        return null;
      }

      this.status.backend = "whisper.cpp-cli";
      return transcript;
    } catch {
      return null;
    } finally {
      await this.disposeTempAudio(tempAudio);
    }
  }

  private async writeTempAudio(audioBuffer: Buffer, mimeType: string): Promise<TempAudio> {
    const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : "wav";
    const tempDir = await mkdtemp(join(tmpdir(), "jarvis-voice-"));
    const audioPath = join(tempDir, `clip.${ext}`);
    const outputBasePath = join(tempDir, "result");
    await writeFile(audioPath, audioBuffer);
    return { tempDir, audioPath, outputBasePath };
  }

  private async disposeTempAudio(tempAudio: TempAudio): Promise<void> {
    try {
      await rm(tempAudio.tempDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn("Unable to remove temporary voice files.", error);
    }
  }

  private setError(message: string): void {
    this.status.lastError = message;
    this.emitEvent({
      type: "error",
      atIso: new Date().toISOString(),
      message,
      status: this.getStatus()
    });
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emitEvent({
      type: "status",
      atIso: new Date().toISOString(),
      status: this.getStatus()
    });
  }

  private emitEvent(event: VoiceEvent): void {
    if (!this.onEvent) {
      return;
    }
    this.onEvent(event);
  }
}
