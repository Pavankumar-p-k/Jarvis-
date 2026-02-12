import type { IntentType, ParsedIntent } from "../../shared/contracts";

const includesAny = (value: string, words: string[]): boolean =>
  words.some((word) => value.includes(word));

export class IntentParser {
  parse(rawCommand: string): ParsedIntent {
    const text = rawCommand.trim().toLowerCase();

    if (!text) {
      return { type: "unknown", confidence: 0, entities: {} };
    }

    if (includesAny(text, ["open ", "launch ", "start "])) {
      const app = text.replace(/^(open|launch|start)\s+/, "");
      return { type: "open_app", confidence: 0.92, entities: { app } };
    }

    if (includesAny(text, ["play ", "resume music", "music on"])) {
      return { type: "play_media", confidence: 0.85, entities: {} };
    }

    if (includesAny(text, ["pause", "stop music", "music off"])) {
      return { type: "pause_media", confidence: 0.85, entities: {} };
    }

    if (includesAny(text, ["remind", "reminder"])) {
      return this.parseReminderIntent(text);
    }

    if (includesAny(text, ["alarm", "wake me"])) {
      return this.parseAlarmIntent(text);
    }

    if (includesAny(text, ["run routine", "start routine", "routine "])) {
      const name = text.replace(/^(run|start)?\s*routine\s+/, "");
      return { type: "run_routine", confidence: 0.88, entities: { name } };
    }

    if (includesAny(text, ["list reminders", "show reminders"])) {
      return { type: "list_reminders", confidence: 0.88, entities: {} };
    }

    if (includesAny(text, ["system info", "status", "telemetry"])) {
      return { type: "system_info", confidence: 0.86, entities: {} };
    }

    return { type: "unknown", confidence: 0.25, entities: { raw: text } };
  }

  private parseReminderIntent(text: string): ParsedIntent {
    const inMinutes = text.match(/in\s+(\d+)\s*(m|min|minutes)/);
    const inHours = text.match(/in\s+(\d+)\s*(h|hr|hours)/);
    const atClock = text.match(/at\s+(\d{1,2}):(\d{2})/);
    const title = text
      .replace("remind me", "")
      .replace("reminder", "")
      .replace(/in\s+\d+\s*(m|min|minutes|h|hr|hours)/, "")
      .replace(/at\s+\d{1,2}:\d{2}/, "")
      .trim();

    const entities: Record<string, string> = { title: title || "Reminder" };

    if (inMinutes) {
      entities.delayMinutes = inMinutes[1];
    } else if (inHours) {
      entities.delayMinutes = String(Number(inHours[1]) * 60);
    } else if (atClock) {
      entities.atHour = atClock[1];
      entities.atMinute = atClock[2];
    } else {
      entities.delayMinutes = "15";
    }

    return { type: "set_reminder", confidence: 0.9, entities };
  }

  private parseAlarmIntent(text: string): ParsedIntent {
    const atClock = text.match(/(\d{1,2}):(\d{2})/);
    const entities: Record<string, string> = { label: "Alarm" };
    if (atClock) {
      entities.atHour = atClock[1];
      entities.atMinute = atClock[2];
    }
    return { type: "set_alarm", confidence: 0.86, entities };
  }

  requiredPermission(intent: IntentType): "safe" | "confirm" | "admin" {
    if (intent === "open_app" || intent === "run_routine") {
      return "confirm";
    }
    return "safe";
  }
}
