import { describe, expect, it } from "vitest";
import type { AutomationRule } from "../../shared/contracts";
import { AutomationEngine } from "./automation-engine";

describe("AutomationEngine", () => {
  const engine = new AutomationEngine();

  it("runs command + hint actions when conditions match", () => {
    const rules: AutomationRule[] = [
      {
        id: "r1",
        name: "match open",
        enabled: true,
        conditions: [{ type: "contains_command", value: "open steam" }],
        actions: [
          { type: "run_command", value: "/mode gaming" },
          { type: "show_hint", value: "Gaming mode suggestion." }
        ],
        createdAtIso: new Date().toISOString()
      }
    ];

    const result = engine.evaluate(rules, {
      command: "open steam",
      mode: "work"
    });

    expect(result.commands).toContain("/mode gaming");
    expect(result.suggestions.length).toBe(1);
  });
});
