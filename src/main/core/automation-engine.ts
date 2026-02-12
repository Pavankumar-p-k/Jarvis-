import type { AutomationRule, MissionMode, SuggestionItem } from "../../shared/contracts";
import { createId } from "../../shared/id";
import { nowMinutes, parseTimeRange } from "./time";

export interface AutomationContext {
  command: string;
  mode: MissionMode;
}

export interface AutomationOutcome {
  commands: string[];
  mode?: MissionMode;
  suggestions: SuggestionItem[];
}

export class AutomationEngine {
  evaluate(rules: AutomationRule[], context: AutomationContext): AutomationOutcome {
    const outcome: AutomationOutcome = {
      commands: [],
      suggestions: []
    };

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }
      if (!this.matchRule(rule, context)) {
        continue;
      }
      for (const action of rule.actions) {
        if (action.type === "run_command") {
          outcome.commands.push(action.value);
        } else if (action.type === "set_mode") {
          outcome.mode = action.value as MissionMode;
        } else if (action.type === "show_hint") {
          outcome.suggestions.push({
            id: createId("hint"),
            text: action.value,
            reason: `Automation: ${rule.name}`,
            createdAtIso: new Date().toISOString()
          });
        }
      }
    }

    return outcome;
  }

  private matchRule(rule: AutomationRule, context: AutomationContext): boolean {
    return rule.conditions.every((condition) => {
      if (condition.type === "contains_command") {
        return context.command.toLowerCase().includes(condition.value.toLowerCase());
      }

      if (condition.type === "mode_is") {
        return context.mode === condition.value;
      }

      if (condition.type === "time_range") {
        const range = parseTimeRange(condition.value);
        if (!range) {
          return false;
        }
        const current = nowMinutes();
        if (range.startMinutes <= range.endMinutes) {
          return current >= range.startMinutes && current <= range.endMinutes;
        }
        return current >= range.startMinutes || current <= range.endMinutes;
      }

      return false;
    });
  }
}
