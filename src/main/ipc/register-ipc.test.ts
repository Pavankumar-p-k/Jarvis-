import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/contracts";
import { registerIpcHandlers } from "./register-ipc";

const handlerMap = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => {
  return {
    ipcMain: {
      removeHandler: vi.fn((channel: string) => {
        handlerMap.delete(channel);
      }),
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlerMap.set(channel, handler);
      })
    }
  };
});

const makeRuntime = () => {
  return {
    getState: vi.fn(async () => ({ mode: "work" })),
    runCommand: vi.fn(async () => ({ result: { ok: true, message: "ok" }, state: { mode: "work" } })),
    setMode: vi.fn(async () => ({ mode: "work" })),
    completeReminder: vi.fn(async () => ({ mode: "work" })),
    replayCommand: vi.fn(async () => ({ result: { ok: true, message: "ok" }, state: { mode: "work" } })),
    generateBriefing: vi.fn(async () => ({ headline: "h", remindersToday: [], suggestedFocus: "f", generatedAtIso: new Date().toISOString() })),
    reloadPlugins: vi.fn(async () => ({ mode: "work" })),
    setAutomationEnabled: vi.fn(async () => ({ mode: "work" })),
    setPluginEnabled: vi.fn(async () => ({ mode: "work" })),
    terminateProcess: vi.fn(async () => ({ result: { ok: true, message: "done" }, state: { mode: "work" } })),
    createCustomCommand: vi.fn(async () => ({ mode: "work" })),
    updateCustomCommand: vi.fn(async () => ({ mode: "work" })),
    deleteCustomCommand: vi.fn(async () => ({ mode: "work" })),
    listCustomCommands: vi.fn(() => []),
    runCustomCommandByName: vi.fn(async () => ({ result: { ok: true, message: "ran" }, state: { mode: "work" } }))
  };
};

const makeVoiceService = () => {
  return {
    getStatus: vi.fn(() => ({ enabled: false })),
    setEnabled: vi.fn(async () => ({ enabled: true })),
    pushAudio: vi.fn(async () => ({ enabled: true })),
    simulateTranscript: vi.fn(async () => ({ enabled: true }))
  };
};

describe("registerIpcHandlers", () => {
  beforeEach(() => {
    handlerMap.clear();
  });

  it("registers custom command list and run handlers", async () => {
    const runtime = makeRuntime();
    const voiceService = makeVoiceService();

    registerIpcHandlers(
      runtime as unknown as Parameters<typeof registerIpcHandlers>[0],
      voiceService as unknown as Parameters<typeof registerIpcHandlers>[1]
    );

    expect(handlerMap.has(IPC_CHANNELS.listCustomCommands)).toBe(true);
    expect(handlerMap.has(IPC_CHANNELS.runCustomCommandByName)).toBe(true);

    const listHandler = handlerMap.get(IPC_CHANNELS.listCustomCommands);
    const runByNameHandler = handlerMap.get(IPC_CHANNELS.runCustomCommandByName);

    if (!listHandler || !runByNameHandler) {
      throw new Error("Expected handlers to be registered.");
    }

    const listed = await listHandler({});
    expect(listed).toEqual([]);
    expect(runtime.listCustomCommands).toHaveBeenCalledTimes(1);

    await runByNameHandler({}, "  sprint  ", true);
    expect(runtime.runCustomCommandByName).toHaveBeenCalledWith("sprint", true);
  });

  it("validates create custom command payload before runtime call", async () => {
    const runtime = makeRuntime();
    const voiceService = makeVoiceService();

    registerIpcHandlers(
      runtime as unknown as Parameters<typeof registerIpcHandlers>[0],
      voiceService as unknown as Parameters<typeof registerIpcHandlers>[1]
    );

    const createHandler = handlerMap.get(IPC_CHANNELS.createCustomCommand);
    if (!createHandler) {
      throw new Error("Create handler missing.");
    }

    await createHandler({}, {
      name: "Morning",
      trigger: "start morning",
      action: "run routine good morning"
    });

    expect(runtime.createCustomCommand).toHaveBeenCalledTimes(1);
  });
});
