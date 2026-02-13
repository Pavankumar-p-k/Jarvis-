import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VoiceEvent } from "../../shared/contracts";
import { VoiceService } from "./voice-service";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("VoiceService", () => {
  it("detects wake-word and dispatches command text", async () => {
    const commands: string[] = [];
    const events: VoiceEvent[] = [];

    const service = new VoiceService({
      wakeWord: "jarvis",
      onCommand: async (command) => {
        commands.push(command);
        return "ok";
      },
      onEvent: (event) => {
        events.push(event);
      }
    });

    await service.init();
    await service.setEnabled(true);
    await service.simulateTranscript("jarvis open chrome");

    expect(commands).toEqual(["open chrome"]);
    expect(events.some((event) => event.type === "wake")).toBe(true);
    service.destroy();
  });

  it("accepts command after wake-word in short command window", async () => {
    const commands: string[] = [];

    const service = new VoiceService({
      wakeWord: "jarvis",
      onCommand: async (command) => {
        commands.push(command);
      }
    });

    await service.init();
    await service.setEnabled(true);
    await service.simulateTranscript("jarvis");
    await service.simulateTranscript("open steam");

    expect(commands).toEqual(["open steam"]);
    service.destroy();
  });

  it("processes mocked audio chunk without network dependencies", async () => {
    const sample = readFileSync(
      join(process.cwd(), "src", "main", "core", "__fixtures__", "voice", "mock-audio.base64.txt"),
      "utf8"
    ).trim();

    const service = new VoiceService({
      onCommand: async () => "ok"
    });

    await service.init();
    await service.setEnabled(true);
    const first = await service.pushAudio(sample, "audio/wav");
    expect(first.enabled).toBe(true);

    await delay(60);

    const status = service.getStatus();
    expect(status.pendingAudioChunks).toBe(0);
    service.destroy();
  });
});
