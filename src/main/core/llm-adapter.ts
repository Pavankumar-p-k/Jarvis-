import { isLoopbackHost } from "./offline-policy";

interface LlmResponse {
  response?: string;
}

interface FetchResponse {
  ok: boolean;
  json: () => Promise<LlmResponse>;
}

/**
 * Adapter for a local-only LLM endpoint. Remote hosts are rejected by design.
 */
export class LocalLlmAdapter {
  private readonly endpoint: URL | null;

  constructor(
    endpoint = process.env.JARVIS_LOCAL_LLM_ENDPOINT ?? "http://127.0.0.1:11434/api/generate",
    private readonly model = process.env.JARVIS_LOCAL_LLM_MODEL ?? "llama3.1:8b"
  ) {
    this.endpoint = this.toLocalEndpoint(endpoint);
  }

  async ask(prompt: string): Promise<string | null> {
    if (!this.endpoint) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_500);

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
