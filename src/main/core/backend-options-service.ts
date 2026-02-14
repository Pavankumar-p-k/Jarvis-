import type {
  BackendRuntimeOptions,
  BackendRuntimeOptionsUpdate,
  LlmRuntimeOptions,
  VoiceRuntimeOptions
} from "../../shared/contracts";
import { JsonStore } from "./json-store";
import { parseEnvBoolean, strictOfflineEnabled } from "./offline-policy";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const toFiniteOr = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const toOptional = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const buildDefaultBackendOptions = (): BackendRuntimeOptions => {
    const voice: VoiceRuntimeOptions = {
      enabled: parseEnvBoolean(process.env.JARVIS_VOICE_ENABLED, false),
      wakeWord: normalizeText(process.env.JARVIS_WAKE_WORD ?? "jarvis").toLowerCase(),
      wakeRmsThreshold: clamp(toFiniteOr(process.env.JARVIS_WAKE_RMS, 0.045), 0.001, 1),
      wakeRequiredHits: clamp(Math.round(toFiniteOr(process.env.JARVIS_WAKE_HITS, 2)), 1, 12),
      wakeCooldownMs: clamp(Math.round(toFiniteOr(process.env.JARVIS_WAKE_COOLDOWN_MS, 3500)), 300, 60_000),
      commandWindowMs: clamp(Math.round(toFiniteOr(process.env.JARVIS_COMMAND_WINDOW_MS, 7000)), 1000, 60_000),
      whisperCliPath: toOptional(process.env.JARVIS_WHISPER_CPP),
      whisperModelPath: toOptional(process.env.JARVIS_WHISPER_MODEL)
    };

  const llm: LlmRuntimeOptions = {
    enabled: parseEnvBoolean(process.env.JARVIS_LLM_ENABLED, true),
    endpoint: normalizeText(process.env.JARVIS_LOCAL_LLM_ENDPOINT ?? "http://127.0.0.1:11434/api/generate"),
    model: normalizeText(process.env.JARVIS_LOCAL_LLM_MODEL ?? "llama3.1:8b"),
    timeoutMs: clamp(Math.round(toFiniteOr(process.env.JARVIS_LOCAL_LLM_TIMEOUT_MS, 4500)), 500, 30_000)
  };

  return {
    strictOffline: strictOfflineEnabled(),
    voice,
    llm
  };
};

/**
 * Persistent storage for runtime backend options (voice, LLM, offline controls).
 */
export class BackendOptionsService {
  private readonly store: JsonStore<BackendRuntimeOptions>;
  private readonly defaults: BackendRuntimeOptions;
  private options: BackendRuntimeOptions;

  constructor(filePath: string, defaults = buildDefaultBackendOptions()) {
    this.store = new JsonStore<BackendRuntimeOptions>(filePath);
    this.defaults = this.sanitize(defaults, defaults);
    this.options = clone(this.defaults);
  }

  init(): BackendRuntimeOptions {
    const loaded = this.store.read(this.defaults);
    this.options = this.sanitize(loaded, this.defaults);
    this.persist();
    return this.get();
  }

  get(): BackendRuntimeOptions {
    return clone(this.options);
  }

  update(updates: BackendRuntimeOptionsUpdate): BackendRuntimeOptions {
    const merged: BackendRuntimeOptions = {
      strictOffline: updates.strictOffline ?? this.options.strictOffline,
      voice: {
        ...this.options.voice,
        ...(updates.voice ?? {})
      },
      llm: {
        ...this.options.llm,
        ...(updates.llm ?? {})
      }
    };

    this.options = this.sanitize(merged, this.defaults);
    this.persist();
    return this.get();
  }

  reset(): BackendRuntimeOptions {
    this.options = clone(this.defaults);
    this.persist();
    return this.get();
  }

  private sanitize(input: BackendRuntimeOptions, fallback: BackendRuntimeOptions): BackendRuntimeOptions {
    const voice = input.voice ?? fallback.voice;
    const llm = input.llm ?? fallback.llm;

    return {
      strictOffline: input.strictOffline === undefined ? fallback.strictOffline : Boolean(input.strictOffline),
      voice: {
        enabled: Boolean(voice.enabled),
        wakeWord: normalizeText(voice.wakeWord || fallback.voice.wakeWord).toLowerCase() || "jarvis",
        wakeRmsThreshold: clamp(
          toFiniteOr(voice.wakeRmsThreshold, fallback.voice.wakeRmsThreshold),
          0.001,
          1
        ),
        wakeRequiredHits: clamp(
          Math.round(toFiniteOr(voice.wakeRequiredHits, fallback.voice.wakeRequiredHits)),
          1,
          12
        ),
        wakeCooldownMs: clamp(
          Math.round(toFiniteOr(voice.wakeCooldownMs, fallback.voice.wakeCooldownMs)),
          300,
          60_000
        ),
        commandWindowMs: clamp(
          Math.round(toFiniteOr(voice.commandWindowMs, fallback.voice.commandWindowMs)),
          1000,
          60_000
        ),
        whisperCliPath: toOptional(voice.whisperCliPath),
        whisperModelPath: toOptional(voice.whisperModelPath)
      },
      llm: {
        enabled: Boolean(llm.enabled),
        endpoint: normalizeText(llm.endpoint || fallback.llm.endpoint),
        model: normalizeText(llm.model || fallback.llm.model),
        timeoutMs: clamp(Math.round(toFiniteOr(llm.timeoutMs, fallback.llm.timeoutMs)), 500, 30_000)
      }
    };
  }

  private persist(): void {
    this.store.write(this.options);
  }
}
