import { isLoopbackHost } from "./offline-policy";
import type { LlmRuntimeOptions, LlmRuntimeOptionsUpdate } from "../../shared/contracts";

interface LlmResponse {
  response?: string;
}

interface FetchResponse {
  ok: boolean;
  json: () => Promise<LlmResponse>;
}

const clampTimeoutMs = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(500, Math.min(30_000, Math.round(parsed)));
};

/**
 * Adapter for a local-only LLM endpoint. Remote hosts are rejected by design.
 */
export class LocalLlmAdapter {
  private endpoint: URL | null;
  private rawEndpoint: string;
  private model: string;
  private timeoutMs: number;
  private enabled: boolean;

  constructor(
    endpoint = process.env.JARVIS_LOCAL_LLM_ENDPOINT ?? "http://127.0.0.1:11434/api/generate",
    model = process.env.JARVIS_LOCAL_LLM_MODEL ?? "llama3.1:8b",
    timeoutMs = Number(process.env.JARVIS_LOCAL_LLM_TIMEOUT_MS ?? "4500"),
    enabled = true
  ) {
    this.rawEndpoint = endpoint.trim();
    this.model = model.trim();
    this.timeoutMs = clampTimeoutMs(timeoutMs, 4500);
    this.enabled = enabled;
    this.endpoint = this.toLocalEndpoint(endpoint);
  }

  async ask(prompt: string): Promise<string | null> {
    if (!this.enabled || !this.endpoint) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = (await fetch(this.endpoint.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false
        }),
        signal: controller.signal
      })) as unknown as FetchResponse;

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      return typeof payload.response === "string" ? payload.response : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  getOptions(): LlmRuntimeOptions {
    return {
      enabled: this.enabled,
      endpoint: this.rawEndpoint,
      model: this.model,
      timeoutMs: this.timeoutMs
    };
  }

  setOptions(updates: LlmRuntimeOptionsUpdate): LlmRuntimeOptions {
    if (updates.endpoint !== undefined) {
      this.rawEndpoint = updates.endpoint.trim();
      this.endpoint = this.toLocalEndpoint(this.rawEndpoint);
    }

    if (updates.model !== undefined) {
      this.model = updates.model.trim() || this.model;
    }

    if (updates.timeoutMs !== undefined) {
      this.timeoutMs = clampTimeoutMs(updates.timeoutMs, this.timeoutMs);
    }

    if (updates.enabled !== undefined) {
      this.enabled = updates.enabled;
    }

    return this.getOptions();
  }

  private toLocalEndpoint(rawEndpoint: string): URL | null {
    try {
      const parsed = new URL(rawEndpoint);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      if (!isLoopbackHost(parsed.hostname)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
