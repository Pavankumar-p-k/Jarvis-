import type { AssistantState, MemoryProfile, TelemetrySnapshot } from "./contracts";

export const buildDefaultTelemetry = (): TelemetrySnapshot => ({
  cpuPercent: 0,
  memoryUsedMb: 0,
  memoryTotalMb: 0,
  uptimeSec: 0,
  networkRxKb: 0,
  networkTxKb: 0,
  topProcesses: [],
  timestampIso: new Date().toISOString()
});

export const buildDefaultMemory = (): MemoryProfile => ({
  preferredApps: ["chrome", "spotify", "vscode"],
  commonCommands: [],
  lastMode: "work",
  updatedAtIso: new Date().toISOString()
});

export const buildDefaultState = (): AssistantState => ({
  mode: "work",
  telemetry: buildDefaultTelemetry(),
  reminders: [],
  alarms: [],
  routines: [],
  customCommands: [],
  memory: buildDefaultMemory(),
  suggestions: [],
  commandHistory: [],
  automations: [],
  plugins: []
});
