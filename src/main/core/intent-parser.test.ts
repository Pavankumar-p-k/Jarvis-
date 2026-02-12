import { describe, expect, it } from "vitest";
import { IntentParser } from "./intent-parser";

describe("IntentParser", () => {
  const parser = new IntentParser();

  it("parses app opening intent", () => {
    const parsed = parser.parse("open chrome");
    expect(parsed.type).toBe("open_app");
    expect(parsed.entities.app).toBe("chrome");
  });

  it("parses reminder delay", () => {
    const parsed = parser.parse("remind me drink water in 20m");
    expect(parsed.type).toBe("set_reminder");
    expect(parsed.entities.delayMinutes).toBe("20");
  });

  it("parses alarm clock time", () => {
    const parsed = parser.parse("set alarm 07:30");
    expect(parsed.type).toBe("set_alarm");
    expect(parsed.entities.atHour).toBe("07");
    expect(parsed.entities.atMinute).toBe("30");
  });

  it("returns unknown for unsupported command", () => {
    const parsed = parser.parse("hello jarvis");
    expect(parsed.type).toBe("unknown");
  });
});
