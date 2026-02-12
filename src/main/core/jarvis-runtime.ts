import { exec, spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ActionResult,
  AlarmItem,
  AssistantState,
  CommandRecord,
  CommandResponse,
  MissionMode,
  MorningBriefing,
  PermissionLevel,
  ReminderItem,
  RoutineItem,
  SuggestionItem
} from "../../shared/contracts";
import { buildDefaultState } from "../../shared/defaults";
import { createId } from "../../shared/id";
import { commandSchema } from "../../shared/schemas";
import { AutomationEngine } from "./automation-engine";
import { BriefingService } from "./briefing-service";
import { IntentParser } from "./intent-parser";
import { JsonStore } from "./json-store";
import { LocalLlmAdapter } from "./llm-adapter";
import { Logger } from "./logger";
import { PermissionGuard } from "./permission-guard";
import { PluginService } from "./plugin-service";
import { Scheduler } from "./scheduler";
import { TelemetryService } from "./telemetry-service";

interface RuntimeOptions {
  dataDir: string;
  pluginsDir: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defaultRoutines = (): RoutineItem[] => [
  {
    id: createId("routine"),
    name: "good morning",
    steps: [
      { id: createId("step"), command: "open chrome", description: "Open browser" },
      { id: createId("step"), command: "system info", description: "Load telemetry" }
    ],
    createdAtIso: new Date().toISOString()
  },
  {
    id: createId("routine"),
    name: "focus sprint",
    steps: [
      { id: createId("step"), command: "/mode focus" },
      { id: createId("step"), command: "remind me standup in 50m" }
    ],
    createdAtIso: new Date().toISOString()
  }
];

const defaultAutomations = () => [
  {
    id: createId("auto"),
    name: "Gaming mode helper",
    enabled: true,
    conditions: [{ type: "contains_command" as const, value: "open steam" }],
    actions: [
      { type: "set_mode" as const, value: "gaming" },
      { type: "show_hint" as const, value: "Gaming mode active: background alerts reduced." }
    ],
    createdAtIso: new Date().toISOString()
  },
  {
    id: createId("auto"),
    name: "Morning work hint",
    enabled: true,
    conditions: [
      { type: "time_range" as const, value: "08:00-11:00" },
      { type: "mode_is" as const, value: "work" }
    ],
    actions: [{ type: "show_hint" as const, value: "Morning block: tackle highest priority task first." }],
    createdAtIso: new Date().toISOString()
  }
];

const appCommandMap: Record<string, string> = {
  chrome: "start chrome",
  vscode: "start code",
  spotify: "start spotify",
  notepad: "start notepad",
  calc: "start calc",
  terminal: "start powershell",
  steam: "start steam"
};

export class JarvisRuntime {
  private readonly logger = new Logger();
  private readonly parser = new IntentParser();
  private readonly guard = new PermissionGuard("admin");
  private readonly telemetryService = new TelemetryService();
  private readonly scheduler = new Scheduler();
  private readonly automationEngine = new AutomationEngine();
  private readonly briefingService = new BriefingService();
  private readonly llm = new LocalLlmAdapter();
  private readonly pluginService: PluginService;
  private readonly stateStore: JsonStore<AssistantState>;
  private state: AssistantState;

  constructor(private readonly options: RuntimeOptions) {
    this.stateStore = new JsonStore(join(options.dataDir, "state.json"));
    this.pluginService = new PluginService(options.pluginsDir, this.logger);
    this.state = buildDefaultState();
  }

  async init(): Promise<void> {
    const loaded = this.stateStore.read(buildDefaultState());
    this.state = loaded;
    if (this.state.routines.length === 0) {
      this.state.routines = defaultRoutines();
    }
    if (this.state.automations.length === 0) {
      this.state.automations = defaultAutomations();
    }
    this.state.plugins = this.pluginService.loadPlugins();
    this.refreshTelemetry();
    this.saveState();

    this.scheduler.start(() => {
      this.refreshTelemetry();
      this.reconcileDeadlines();
      this.saveState();
    }, 15_000);
  }

  destroy(): void {
    this.scheduler.stop();
  }

  getState(): AssistantState {
    return clone(this.state);
  }

  async setMode(mode: MissionMode): Promise<AssistantState> {
    this.state.mode = mode;
    this.state.memory.lastMode = mode;
    this.state.memory.updatedAtIso = new Date().toISOString();
    this.pushSuggestion(`Mode switched to ${mode}`, "Mission control");
    this.saveState();
    return this.getState();
  }

  async completeReminder(id: string): Promise<AssistantState> {
    const reminder = this.state.reminders.find((item) => item.id === id);
    if (reminder) {
      reminder.status = "done";
      this.pushSuggestion(`Reminder completed: ${reminder.title}`, "Planner");
    }
    this.saveState();
    return this.getState();
  }

  async replayCommand(id: string): Promise<CommandResponse> {
    const record = this.state.commandHistory.find((item) => item.id === id);
    if (!record) {
      return {
        result: { ok: false, message: "Command history item not found." },
        state: this.getState()
      };
    }
    return this.runCommand(record.command, true);
  }

  async generateBriefing(): Promise<MorningBriefing> {
    return this.briefingService.generate(this.state.reminders, this.state.mode);
  }

  async reloadPlugins(): Promise<AssistantState> {
    this.state.plugins = this.pluginService.loadPlugins();
    this.pushSuggestion(`Loaded ${this.state.plugins.length} plugin(s).`, "Plugin store");
    this.saveState();
    return this.getState();
  }

  async runCommand(rawCommand: string, bypassConfirmation = false): Promise<CommandResponse> {
    return this.executeCommand(rawCommand, bypassConfirmation, 0, true);
  }

  private async executeCommand(
    rawCommand: string,
    bypassConfirmation: boolean,
    depth: number,
    writeHistory: boolean
  ): Promise<CommandResponse> {
    if (depth > 2) {
      return {
        result: { ok: false, message: "Automation recursion blocked." },
        state: this.getState()
      };
    }

    const command = commandSchema.safeParse(rawCommand);
    if (!command.success) {
      return {
        result: { ok: false, message: "Invalid command input." },
        state: this.getState()
      };
    }
    const normalized = command.data;

    const plugin = this.pluginService.findByCommand(normalized, this.state.plugins);
    if (plugin) {
      return this.executePluginCommand(normalized, plugin.manifest.permissionLevel, bypassConfirmation);
    }

    const lower = normalized.toLowerCase();
    if (lower.startsWith("/mode ")) {
      const mode = lower.replace("/mode ", "").trim() as MissionMode;
      if (["work", "gaming", "focus", "night"].includes(mode)) {
        await this.setMode(mode);
        const result = { ok: true, message: `Mode updated to ${mode}.` };
        this.recordCommand(normalized, "system_info", result, writeHistory);
        return { result, state: this.getState() };
      }
    }

    if (lower.startsWith("/ask ")) {
      const prompt = normalized.slice(5).trim();
      const llm = await this.llm.ask(prompt);
      const message = llm ?? "Local LLM unavailable. Falling back to rules-only mode.";
      const result = { ok: true, message };
      this.recordCommand(normalized, "unknown", result, writeHistory);
      return { result, state: this.getState() };
    }

    const parsedIntent = this.parser.parse(normalized);
    const requiredPermission = this.parser.requiredPermission(parsedIntent.type);

    if (!this.guard.canRun(requiredPermission)) {
      const result = { ok: false, message: "Permission denied." };
      this.recordCommand(normalized, parsedIntent.type, result, writeHistory);
      return { result, state: this.getState() };
    }

    if (this.guard.needsConfirmation(requiredPermission, bypassConfirmation)) {
      return {
        result: {
          ok: false,
          message: "Confirmation needed for this action. Run again with confirmation.",
          needsConfirmation: true
        },
        state: this.getState()
      };
    }

    const result = await this.executeIntent(parsedIntent.type, parsedIntent.entities);
    this.recordCommand(normalized, parsedIntent.type, result, writeHistory);

    const auto = this.automationEngine.evaluate(this.state.automations, {
      command: normalized,
      mode: this.state.mode
    });
    for (const suggestion of auto.suggestions) {
      this.state.suggestions.unshift(suggestion);
    }
    if (auto.mode) {
      this.state.mode = auto.mode;
    }
    for (const autoCommand of auto.commands) {
      await this.executeCommand(autoCommand, true, depth + 1, false);
    }

    this.saveState();
    return { result, state: this.getState() };
  }

  private async executePluginCommand(
    command: string,
    permission: PermissionLevel,
    bypassConfirmation: boolean
  ): Promise<CommandResponse> {
    if (this.guard.needsConfirmation(permission, bypassConfirmation)) {
      return {
        result: {
          ok: false,
          message: "Plugin action requires confirmation.",
          needsConfirmation: true
        },
        state: this.getState()
      };
    }

    const result: ActionResult = {
      ok: true,
      message: `Plugin handled command: ${command}`
    };
    this.recordCommand(command, "unknown", result, true);
    this.saveState();
    return { result, state: this.getState() };
  }

  private async executeIntent(
    type: CommandRecord["intent"],
    entities: Record<string, string>
  ): Promise<ActionResult> {
    if (type === "open_app") {
      return this.openApp(entities.app ?? "");
    }

    if (type === "play_media") {
      return { ok: true, message: "Media playback command sent." };
    }

    if (type === "pause_media") {
      return { ok: true, message: "Media pause command sent." };
    }

    if (type === "set_reminder") {
      const reminder = this.createReminder(entities);
      this.state.reminders.unshift(reminder);
      this.pushSuggestion(`Reminder added: ${reminder.title}`, "Planner");
      return { ok: true, message: `Reminder set for ${new Date(reminder.dueAtIso).toLocaleString()}` };
    }

    if (type === "set_alarm") {
      const alarm = this.createAlarm(entities);
      this.state.alarms.unshift(alarm);
      this.pushSuggestion(`Alarm scheduled: ${alarm.label}`, "Planner");
      return { ok: true, message: `Alarm set for ${new Date(alarm.triggerAtIso).toLocaleString()}` };
    }

    if (type === "run_routine") {
      const routineName = (entities.name ?? "").trim();
      const routine = this.state.routines.find((item) =>
        item.name.toLowerCase().includes(routineName.toLowerCase())
      );
      if (!routine) {
        return { ok: false, message: "Routine not found." };
      }
      for (const step of routine.steps) {
        await this.executeCommand(step.command, true, 1, false);
      }
      routine.lastRunAtIso = new Date().toISOString();
      return { ok: true, message: `Routine "${routine.name}" executed.` };
    }

    if (type === "list_reminders") {
      const pending = this.state.reminders.filter((item) => item.status === "pending").length;
      return { ok: true, message: `You have ${pending} pending reminder(s).` };
    }

    if (type === "system_info") {
      this.refreshTelemetry();
      const t = this.state.telemetry;
      return {
        ok: true,
        message: `CPU ${t.cpuPercent}% | RAM ${t.memoryUsedMb}/${t.memoryTotalMb} MB | Proc ${t.topProcesses.length}`
      };
    }

    return {
      ok: false,
      message: "Command not recognized. Try: open chrome, remind me in 10m, /mode focus"
    };
  }

  private openApp(rawApp: string): ActionResult {
    const app = rawApp.trim().toLowerCase();
    if (!app) {
      return { ok: false, message: "App name missing." };
    }
    if (app.startsWith("http://") || app.startsWith("https://")) {
      exec(`start ${app}`, { windowsHide: true });
      return { ok: true, message: `Opening URL ${app}` };
    }
    const command = appCommandMap[app];
    if (!command) {
      return { ok: false, message: `App "${app}" not in launcher map.` };
    }
    spawn("cmd", ["/c", command], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    this.bumpPreferredApp(app);
    return { ok: true, message: `Launching ${app}` };
  }

  private createReminder(entities: Record<string, string>): ReminderItem {
    const dueAt = this.resolveDateTime(entities, Number(entities.delayMinutes ?? "15"));
    return {
      id: createId("rem"),
      title: entities.title ?? "Reminder",
      note: entities.note,
      dueAtIso: dueAt.toISOString(),
      status: "pending",
      createdAtIso: new Date().toISOString()
    };
  }

  private createAlarm(entities: Record<string, string>): AlarmItem {
    const dueAt = this.resolveDateTime(entities, 60);
    return {
      id: createId("alarm"),
      label: entities.label ?? "Alarm",
      triggerAtIso: dueAt.toISOString(),
      enabled: true,
      createdAtIso: new Date().toISOString()
    };
  }

  private resolveDateTime(entities: Record<string, string>, fallbackDelayMinutes: number): Date {
    const now = new Date();
    const hasClock = entities.atHour !== undefined && entities.atMinute !== undefined;
    if (hasClock) {
      const due = new Date(now);
      due.setHours(Number(entities.atHour), Number(entities.atMinute), 0, 0);
      if (due.getTime() <= now.getTime()) {
        due.setDate(due.getDate() + 1);
      }
      return due;
    }
    const delay = Number(entities.delayMinutes ?? String(fallbackDelayMinutes));
    const due = new Date(now.getTime() + Math.max(1, delay) * 60 * 1000);
    return due;
  }

  private refreshTelemetry(): void {
    this.state.telemetry = this.telemetryService.getSnapshot();
  }

  private reconcileDeadlines(): void {
    const now = Date.now();
    for (const reminder of this.state.reminders) {
      if (reminder.status === "pending" && Date.parse(reminder.dueAtIso) < now - 60_000) {
        reminder.status = "missed";
      }
    }

    for (const alarm of this.state.alarms) {
      if (alarm.enabled && Date.parse(alarm.triggerAtIso) <= now) {
        alarm.enabled = false;
        this.pushSuggestion(`Alarm triggered: ${alarm.label}`, "Alarm");
      }
    }
  }

  private recordCommand(
    command: string,
    intent: CommandRecord["intent"],
    result: ActionResult,
    writeHistory: boolean
  ): void {
    if (!writeHistory) {
      return;
    }
    const record: CommandRecord = {
      id: createId("cmd"),
      command,
      intent,
      success: result.ok,
      resultMessage: result.message,
      timestampIso: new Date().toISOString()
    };
    this.state.commandHistory.unshift(record);
    this.state.commandHistory = this.state.commandHistory.slice(0, 120);
    this.bumpCommonCommand(command);
  }

  private bumpPreferredApp(app: string): void {
    if (!this.state.memory.preferredApps.includes(app)) {
      this.state.memory.preferredApps.unshift(app);
      this.state.memory.preferredApps = this.state.memory.preferredApps.slice(0, 10);
      this.state.memory.updatedAtIso = new Date().toISOString();
    }
  }

  private bumpCommonCommand(command: string): void {
    const list = this.state.memory.commonCommands.filter((item) => item !== command);
    list.unshift(command);
    this.state.memory.commonCommands = list.slice(0, 30);
    this.state.memory.updatedAtIso = new Date().toISOString();
  }

  private pushSuggestion(text: string, reason: string): void {
    const suggestion: SuggestionItem = {
      id: createId("sg"),
      text,
      reason,
      createdAtIso: new Date().toISOString()
    };
    this.state.suggestions.unshift(suggestion);
    this.state.suggestions = this.state.suggestions.slice(0, 40);
  }

  private saveState(): void {
    this.stateStore.write(this.state);
  }
}
