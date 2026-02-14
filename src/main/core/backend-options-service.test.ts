import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { BackendOptionsService } from "./backend-options-service";

const makePath = (): { dir: string; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-backend-options-"));
  return {
    dir,
    file: join(dir, "backend-options.json")
  };
};

describe("BackendOptionsService", () => {
  it("initializes with defaults and persists options", () => {
    const temp = makePath();
    try {
      const service = new BackendOptionsService(temp.file, {
        strictOffline: true,
        voice: {
          enabled: false,
          wakeWord: "jarvis",
          wakeRmsThreshold: 0.04,
          wakeRequiredHits: 2,
          wakeCooldownMs: 3000,
          commandWindowMs: 7000
        },
        llm: {
          enabled: true,
          endpoint: "http://127.0.0.1:11434/api/generate",
          model: "llama3.1:8b",
          timeoutMs: 4500
        }
      });

      const options = service.init();
      expect(options.strictOffline).toBe(true);
      expect(options.voice.wakeWord).toBe("jarvis");

      const fileRaw = JSON.parse(readFileSync(temp.file, "utf8")) as { strictOffline: boolean };
      expect(fileRaw.strictOffline).toBe(true);
    } finally {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  });

  it("updates nested voice/llm options and clamps values", () => {
    const temp = makePath();
    try {
      const service = new BackendOptionsService(temp.file);
      service.init();

      const updated = service.update({
        strictOffline: false,
        voice: {
          wakeWord: "hey jarvis",
          wakeRmsThreshold: 999,
          wakeRequiredHits: 0
        },
        llm: {
          endpoint: "http://localhost:11434/api/generate",
          timeoutMs: 200
        }
      });

      expect(updated.strictOffline).toBe(false);
      expect(updated.voice.wakeWord).toBe("hey jarvis");
      expect(updated.voice.wakeRmsThreshold).toBe(1);
      expect(updated.voice.wakeRequiredHits).toBe(1);
      expect(updated.llm.endpoint).toBe("http://localhost:11434/api/generate");
      expect(updated.llm.timeoutMs).toBe(500);
    } finally {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  });
});
