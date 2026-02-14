import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalLlmAdapter } from "./llm-adapter";

describe("LocalLlmAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects non-loopback endpoints in strict offline mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LocalLlmAdapter("https://api.openai.com/v1/chat/completions");
    const result = await adapter.ask("hello");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries loopback endpoint when available", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        response: "local answer"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LocalLlmAdapter("http://127.0.0.1:11434/api/generate");
    const result = await adapter.ask("status");

    expect(result).toBe("local answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports runtime option updates", () => {
    const adapter = new LocalLlmAdapter("http://127.0.0.1:11434/api/generate", "llama3.1:8b", 4500, true);
    const next = adapter.setOptions({
      enabled: false,
      model: "qwen2.5:7b",
      timeoutMs: 6000
    });

    expect(next.enabled).toBe(false);
    expect(next.model).toBe("qwen2.5:7b");
    expect(next.timeoutMs).toBe(6000);
  });
});
