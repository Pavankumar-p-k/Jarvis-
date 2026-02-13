import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VoiceBackend, VoiceEvent, VoiceStatus } from "../../shared/contracts";
import { Logger } from "./logger";

const requireFromHere = createRequire(__filename);
const execFileAsync = promisify(execFile);

interface VoiceServiceOptions {
  wakeWord?: string;
  whisperCliPath?: string;
  whisperModelPath?: string;
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

type UnknownRecord = Record<string, unknown>;

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

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

export class VoiceService {
  private readonly logger = new Logger();
  private readonly wakeWord: string;
  private readonly onCommand: (command: string) => Promise<string | void>;
  private readonly onEvent?: (event: VoiceEvent) => void;
  private readonly whisperCliPath?: string;
  private readonly whisperModelPath?: string;

  private enabled = false;
  private processing = false;
  private commandWindowUntil = 0;
  private chunkQueue: AudioChunk[] = [];

  private status: VoiceStatus;
  private backend: VoiceBackend = "stub";
  private whisperAddon: unknown | null | undefined;

  constructor(options: VoiceServiceOptions) {
    this.wakeWord = normalizeText(options.wakeWord ?? "jarvis").toLowerCase();
    this.onCommand = options.onCommand;
    this.onEvent = options.onEvent;
    this.whisperCliPath = options.whisperCliPath ?? process.env.JARVIS_WHISPER_CPP;
    this.whisperModelPath = options.whisperModelPath ?? process.env.JARVIS_WHISPER_MODEL;

    this.status = {
      enabled: false,
      listening: false,
      wakeWord: this.wakeWord,
      backend: "stub",
      pendingAudioChunks: 0
    };
  }

  async init(): Promise<void> {
    await this.detectBackend();
    this.emitStatus();
  }

  destroy(): void {
    this.enabled = false;
    this.processing = false;
    this.commandWindowUntil = 0;
    this.chunkQueue = [];
    this.status.enabled = false;
    this.status.listening = false;
    this.status.pendingAudioChunks = 0;
    this.emitStatus();
  }

  getStatus(): VoiceStatus {
    return { ...this.status };
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
    }

    this.emitStatus();
    return this.getStatus();
  }

  async pushAudio(base64Audio: string, mimeType = "audio/webm"): Promise<VoiceStatus> {
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
    await this.processTranscript(rawTranscript);
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
        const transcript = await this.transcribeChunk(next);
        if (transcript) {
          await this.processTranscript(transcript);
        }
      } catch (error) {
        this.setError(`Voice chunk processing failed: ${getErrorMessage(error)}`);
      }
    }

    this.processing = false;
    this.status.pendingAudioChunks = this.chunkQueue.length;
    this.emitStatus();
  }

  private async transcribeChunk(chunk: AudioChunk): Promise<string | null> {
    const audioBuffer = Buffer.from(chunk.base64Audio, "base64");
    if (audioBuffer.length === 0) {
      return null;
    }

    const addonTranscript = await this.tryWhisperAddon(audioBuffer, chunk.mimeType);
    if (addonTranscript) {
      return addonTranscript;
    }

    const cliTranscript = await this.tryWhisperCli(audioBuffer, chunk.mimeType);
    if (cliTranscript) {
      return cliTranscript;
    }

    return null;
  }

  private async processTranscript(rawTranscript: string): Promise<void> {
    const transcript = normalizeText(rawTranscript);
    if (!transcript) {
      return;
    }

    this.status.lastTranscript = transcript;
    this.emitStatus();

    const transcriptLower = transcript.toLowerCase();
    const wakeIndex = transcriptLower.indexOf(this.wakeWord);
    const now = Date.now();

    if (wakeIndex >= 0) {
      const afterWake = normalizeText(transcript.slice(wakeIndex + this.wakeWord.length));
      this.status.lastWakeAtIso = new Date().toISOString();
      this.emitEvent({
        type: "wake",
        atIso: new Date().toISOString(),
        transcript,
        status: this.getStatus()
      });

      if (afterWake) {
        await this.dispatchCommand(afterWake, transcript);
      } else {
        this.commandWindowUntil = now + 8_000;
      }
      return;
    }

    if (this.commandWindowUntil > now) {
      this.commandWindowUntil = 0;
      await this.dispatchCommand(transcript, transcript);
    }
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
    const defaultRecord = maybeDefault && typeof maybeDefault === "object" ? (maybeDefault as UnknownRecord) : undefined;

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
    const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : "bin";
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
