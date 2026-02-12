import { describe, expect, it } from "vitest";
import { parseTimeRange } from "./time";

describe("parseTimeRange", () => {
  it("parses valid time range", () => {
    const value = parseTimeRange("08:30-11:15");
    expect(value).not.toBeNull();
    expect(value?.startMinutes).toBe(510);
    expect(value?.endMinutes).toBe(675);
  });

  it("returns null for invalid range", () => {
    expect(parseTimeRange("abc")).toBeNull();
  });
});
