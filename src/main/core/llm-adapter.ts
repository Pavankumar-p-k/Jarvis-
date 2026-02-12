export class LocalLlmAdapter {
  constructor(
    private readonly endpoint = "http://127.0.0.1:11434/api/generate",
    private readonly model = "llama3.1:8b"
  ) {}

  async ask(prompt: string): Promise<string | null> {
    try {
      const response = (await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false
        })
      })) as unknown as {
        ok: boolean;
        json: () => Promise<{ response?: string }>;
      };
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      return payload.response ?? null;
    } catch {
      return null;
    }
  }
}
