import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ActionResult,
  AlarmItem,
  AssistantState,
  CommandRecord,
  CommandResponse,
  CreateCustomCommandInput,
  CustomCommand,
  MissionMode,
  MorningBriefing,
  PermissionLevel,
  ReminderItem,
  RoutineItem,
  SuggestionItem,
  UpdateCustomCommandInput
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

interface AppLaunchSpec {
  file: string;
  args: string[];
}

interface CustomCommandMatch {
  command: CustomCommand;
  args: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeSpaces = (value: string): string => value.trim().replace(/\s+/g, " ");

const normalizeTrigger = (value: string): string => normalizeSpaces(value).toLowerCase();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const appLaunchMap: Record<string, AppLaunchSpec> = {
  chrome: { file: "cmd", args: ["/c", "start", "", "chrome"] },
  vscode: { file: "cmd", args: ["/c", "start", "", "code"] },
  spotify: { file: "cmd", args: ["/c", "start", "", "spotify"] },
  notepad: { file: "cmd", args: ["/c", "start", "", "notepad"] },
  calc: { file: "cmd", args: ["/c", "start", "", "calc"] },
  terminal: { file: "cmd", args: ["/c", "start", "", "powershell"] },
  steam: { file: "cmd", args: ["/c", "start", "", "steam"] }
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

  constructor(options: RuntimeOptions) {
    this.stateStore = new JsonStore(join(options.dataDir, "state.json"));
    this.pluginService = new PluginService(options.pluginsDir, this.logger);
    this.state = buildDefaultState();
  }

  async init(): Promise<void> {
    const loaded = this.stateStore.read(buildDefaultState());
    this.state = loaded;

    if (!Array.isArray(this.state.routines) || this.state.routines.length === 0) {
      this.state.routines = defaultRoutines();
    }
    if (!Array.isArray(this.state.automations) || this.state.automations.length === 0) {
      this.state.automations = defaultAutomations();
    }
    if (!Array.isArray(this.state.customCommands)) {
      this.state.customCommands = [];
    }

    this.state.plugins = this.loadPluginsWithState(this.state.plugins);
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

  async createCustomCommand(input: CreateCustomCommandInput): Promise<AssistantState> {
    const name = normalizeSpaces(input.name);
    const trigger = normalizeTrigger(input.trigger);
    const action = normalizeSpaces(input.action);

    if (this.hasCustomCommandConflict(name, trigger)) {
      throw new Error("Custom command name or trigger already exists.");
    }

    const nowIso = new Date().toISOString();
    const created: CustomCommand = {
      id: createId("cc"),
      name,
      trigger,
      action,
      passThroughArgs: Boolean(input.passThroughArgs),
      enabled: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    this.state.customCommands.unshift(created);
    this.pushSuggestion(`Custom command created: ${created.name}`, "Command builder");
    this.recordCommand(
      `custom command create ${created.name}`,
      "custom_command",
      { ok: true, message: `Custom command "${created.name}" created.` },
      true
    );
    this.saveState();
    return this.getState();
  }

  async updateCustomCommand(id: string, updates: UpdateCustomCommandInput): Promise<AssistantState> {
    const target = this.state.customCommands.find((item) => item.id === id);
    if (!target) {
      throw new Error("Custom command not found.");
    }

    const nextName = updates.name !== undefined ? normalizeSpaces(updates.name) : target.name;
    const nextTrigger = updates.trigger !== undefined ? normalizeTrigger(updates.trigger) : target.trigger;
    const nextAction = updates.action !== undefined ? normalizeSpaces(updates.action) : target.action;

    if (this.hasCustomCommandConflict(nextName, nextTrigger, id)) {
      throw new Error("Another custom command already uses that name or trigger.");
    }

    target.name = nextName;
    target.trigger = nextTrigger;
    target.action = nextAction;
    if (updates.passThroughArgs !== undefined) {
      target.passThroughArgs = updates.passThroughArgs;
    }
    if (updates.enabled !== undefined) {
      target.enabled = updates.enabled;
    }
    target.updatedAtIso = new Date().toISOString();

    this.pushSuggestion(`Custom command updated: ${target.name}`, "Command builder");
    this.recordCommand(
      `custom command update ${target.name}`,
      "custom_command",
      { ok: true, message: `Custom command "${target.name}" updated.` },
      true
    );
    this.saveState();
    return this.getState();
  }

  async deleteCustomCommand(id: string): Promise<AssistantState> {
    const index = this.state.customCommands.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("Custom command not found.");
    }

    const removed = this.state.customCommands[index];
    this.state.customCommands.splice(index, 1);
    this.pushSuggestion(`Custom command removed: ${removed.name}`, "Command builder");
    this.recordCommand(
      `custom command delete ${removed.name}`,
      "custom_command",
      { ok: true, message: `Custom command "${removed.name}" deleted.` },
      true
    );
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
    this.state.plugins = this.loadPluginsWithState(this.state.plugins);
    this.pushSuggestion(`Loaded ${this.state.plugins.length} plugin(s).`, "Plugin store");
    this.saveState();
    return this.getState();
  }

  async setAutomationEnabled(id: string, enabled: boolean): Promise<AssistantState> {
    const rule = this.state.automations.find((item) => item.id === id);
    if (rule) {
      rule.enabled = enabled;
      this.pushSuggestion(
        `${rule.name} is now ${enabled ? "enabled" : "disabled"}.`,
        "Automation control"
      );
      this.recordCommand(
        `automation ${enabled ? "enable" : "disable"} ${rule.name}`,
        "system_info",
        { ok: true, message: `Automation updated: ${rule.name}` },
        true
      );
    }
    this.saveState();
    return this.getState();
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<AssistantState> {
    const plugin = this.state.plugins.find((item) => item.manifest.id === pluginId);
    if (plugin) {
      plugin.enabled = enabled;
      this.pushSuggestion(
        `Plugin ${plugin.manifest.name} ${enabled ? "enabled" : "disabled"}.`,
        "Plugin control"
      );
      this.recordCommand(
        `plugin ${enabled ? "enable" : "disable"} ${plugin.manifest.name}`,
        "system_info",
        { ok: true, message: `Plugin updated: ${plugin.manifest.name}` },
        true
      );
    }
    this.saveState();
    return this.getState();
  }

  async terminateProcess(pid: number, bypassConfirmation = false): Promise<CommandResponse> {
    const requiredPermission: PermissionLevel = "confirm";
    if (this.guard.needsConfirmation(requiredPermission, bypassConfirmation)) {
      return {
        result: {
          ok: false,
          message: "Confirmation needed before terminating a process.",
          needsConfirmation: true
        },
        state: this.getState()
      };
    }

    const result = this.terminateProcessByPid(pid);
    this.recordCommand(`terminate process ${pid}`, "system_info", result, true);
    this.saveState();
    return { result, state: this.getState() };
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
    if (depth > 4) {
      return {
        result: { ok: false, message: "Command recursion blocked." },
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

    const normalized = normalizeSpaces(command.data);

    const customMatch = this.findCustomCommandMatch(normalized);
    if (customMatch) {
      return this.executeCustomCommand(normalized, customMatch, bypassConfirmation, depth, writeHistory);
    }

    const plugin = this.pluginService.findByCommand(normalized, this.state.plugins);
    if (plugin) {
      return this.executePluginCommand(plugin, normalized, plugin.manifest.permissionLevel, bypassConfirmation, writeHistory);
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

  private async executeCustomCommand(
    sourceCommand: string,
    customMatch: CustomCommandMatch,
    bypassConfirmation: boolean,
    depth: number,
    writeHistory: boolean
  ): Promise<CommandResponse> {
    const targetCommand = this.buildCustomTarget(customMatch.command, customMatch.args);

    if (!targetCommand) {
      const result: ActionResult = { ok: false, message: "Custom command action is empty." };
      this.recordCommand(sourceCommand, "custom_command", result, writeHistory);
      this.saveState();
      return { result, state: this.getState() };
    }

    if (targetCommand.toLowerCase() === sourceCommand.toLowerCase()) {
      const result: ActionResult = { ok: false, message: "Custom command points to itself." };
      this.recordCommand(sourceCommand, "custom_command", result, writeHistory);
      this.saveState();
      return { result, state: this.getState() };
    }

    const delegated = await this.executeCommand(targetCommand, bypassConfirmation, depth + 1, false);
    const result: ActionResult = {
      ok: delegated.result.ok,
      message: delegated.result.ok
        ? `Custom command "${customMatch.command.name}" executed.`
        : `Custom command "${customMatch.command.name}" failed: ${delegated.result.message}`,
      data: {
        delegatedCommand: targetCommand,
        delegatedResult: delegated.result.message
      }
    };

    this.recordCommand(sourceCommand, "custom_command", result, writeHistory);
    this.saveState();
    return { result, state: this.getState() };
  }

  private async executePluginCommand(
    pluginState: AssistantState["plugins"][number],
    command: string,
    permission: PermissionLevel,
    bypassConfirmation: boolean,
    writeHistory: boolean
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

    const result = await this.pluginService.executeCommand(pluginState, command, this.getState());
    this.recordCommand(command, "plugin_command", result, writeHistory);
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
      return this.sendMediaPlayPause("Media play/pause signal sent.");
    }

    if (type === "pause_media") {
      return this.sendMediaPlayPause("Media pause signal sent.");
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
      return this.openExternalUrl(app);
    }

    const launchSpec = appLaunchMap[app];
    if (!launchSpec) {
      return { ok: false, message: `App "${app}" not in launcher map.` };
    }

    try {
      spawn(launchSpec.file, launchSpec.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
      this.bumpPreferredApp(app);
      return { ok: true, message: `Launching ${app}` };
    } catch {
      return { ok: false, message: `Unable to launch ${app}.` };
    }
  }

  private openExternalUrl(rawUrl: string): ActionResult {
    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, message: "Invalid URL." };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, message: "Only http/https URLs are allowed." };
    }

    try {
      spawn("cmd", ["/c", "start", "", parsed.toString()], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
      return { ok: true, message: `Opening URL ${parsed.toString()}` };
    } catch {
      return { ok: false, message: "Failed to open URL." };
    }
  }

  private sendMediaPlayPause(successMessage: string): ActionResult {
    try {
      execSync(
        "powershell -NoProfile -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{MEDIA_PLAY_PAUSE}')\"",
        { windowsHide: true }
      );
      return { ok: true, message: successMessage };
    } catch {
      return { ok: false, message: "Unable to send media key on this system." };
    }
  }

  private terminateProcessByPid(pid: number): ActionResult {
    if (!Number.isFinite(pid) || pid <= 0) {
      return { ok: false, message: "Invalid PID." };
    }
    try {
      execSync(`taskkill /PID ${Math.floor(pid)} /F`, { windowsHide: true });
      this.refreshTelemetry();
      return { ok: true, message: `Process ${Math.floor(pid)} terminated.` };
    } catch {
      return { ok: false, message: `Failed to terminate PID ${Math.floor(pid)}.` };
    }
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

  private loadPluginsWithState(previous: AssistantState["plugins"]): AssistantState["plugins"] {
    const previousList = Array.isArray(previous) ? previous : [];
    const previousMap = new Map(
      previousList.map((plugin) => [
        plugin.manifest.id,
        { enabled: plugin.enabled, installedAtIso: plugin.installedAtIso }
      ])
    );
    return this.pluginService.loadPlugins().map((plugin) => {
      const found = previousMap.get(plugin.manifest.id);
      if (!found) {
        return plugin;
      }
      return {
        ...plugin,
        enabled: found.enabled,
        installedAtIso: found.installedAtIso
      };
    });
  }

  private findCustomCommandMatch(rawCommand: string): CustomCommandMatch | undefined {
    const commandText = normalizeSpaces(rawCommand);
    const lower = commandText.toLowerCase();

    const enabledCommands = this.state.customCommands
      .filter((item) => item.enabled)
      .sort((a, b) => normalizeTrigger(b.trigger).length - normalizeTrigger(a.trigger).length);

    for (const item of enabledCommands) {
      const trigger = normalizeTrigger(item.trigger);
      const name = item.name.trim().toLowerCase();

      if (lower === trigger || lower === name) {
        return { command: item, args: "" };
      }

      const match = lower.match(new RegExp(`^${escapeRegex(trigger)}\\s+(.+)$`, "i"));
      if (match) {
        const args = normalizeSpaces(match[1] ?? "");
        return { command: item, args };
      }
    }

    return undefined;
  }

  private buildCustomTarget(command: CustomCommand, args: string): string {
    const action = command.action.trim();
    if (!action) {
      return "";
    }

    if (action.includes("{args}")) {
      return normalizeSpaces(action.replace("{args}", args));
    }

    if (command.passThroughArgs && args) {
      return normalizeSpaces(`${action} ${args}`);
    }

    return action;
  }

  private hasCustomCommandConflict(name: string, trigger: string, currentId?: string): boolean {
    const normalizedName = name.trim().toLowerCase();
    const normalizedTrigger = normalizeTrigger(trigger);

    return this.state.customCommands.some((item) => {
      if (currentId && item.id === currentId) {
        return false;
      }

      return item.name.trim().toLowerCase() === normalizedName || normalizeTrigger(item.trigger) === normalizedTrigger;
    });
  }
}
