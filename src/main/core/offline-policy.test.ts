import { describe, expect, it } from "vitest";
import { isLoopbackHost, isOfflineSafeUrl, parseEnvBoolean, strictOfflineEnabled } from "./offline-policy";

describe("offline-policy", () => {
  it("parses strict offline env values", () => {
    expect(parseEnvBoolean("true", false)).toBe(true);
    expect(parseEnvBoolean("0", true)).toBe(false);
    expect(parseEnvBoolean(undefined, true)).toBe(true);
    expect(strictOfflineEnabled("not-a-bool")).toBe(true);
  });

  it("accepts loopback hostnames only", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });

  it("marks remote network URLs as offline-unsafe", () => {
    expect(isOfflineSafeUrl("https://example.com")).toBe(false);
    expect(isOfflineSafeUrl("http://localhost:11434")).toBe(true);
    expect(isOfflineSafeUrl("file:///C:/jarvis/index.html")).toBe(true);
  });
});
