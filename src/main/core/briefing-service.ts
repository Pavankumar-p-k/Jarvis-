import type { MorningBriefing, ReminderItem } from "../../shared/contracts";

const sortByDate = (items: ReminderItem[]): ReminderItem[] =>
  [...items].sort((a, b) => Date.parse(a.dueAtIso) - Date.parse(b.dueAtIso));

export class BriefingService {
  generate(reminders: ReminderItem[], mode: string): MorningBriefing {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const remindersToday = sortByDate(
      reminders.filter((item) => {
        const due = Date.parse(item.dueAtIso);
        return due >= start.getTime() && due <= end.getTime() && item.status === "pending";
      })
    );

    const suggestedFocus =
      mode === "focus"
        ? "Deep work block + notifications minimized"
        : remindersToday.length > 3
          ? "Prioritize top 3 reminders before noon"
          : "Use morning block for proactive tasks";

    return {
      headline: `Good day. ${remindersToday.length} reminder(s) scheduled today.`,
      remindersToday,
      suggestedFocus,
      generatedAtIso: new Date().toISOString()
    };
  }
}
