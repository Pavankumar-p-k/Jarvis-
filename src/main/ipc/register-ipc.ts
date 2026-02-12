import { ipcMain } from "electron";
import { IPC_CHANNELS, type MissionMode } from "../../shared/contracts";
import { commandSchema } from "../../shared/schemas";
import { JarvisRuntime } from "../core/jarvis-runtime";

export const registerIpcHandlers = (runtime: JarvisRuntime): void => {
  ipcMain.handle(IPC_CHANNELS.getState, async () => runtime.getState());

  ipcMain.handle(IPC_CHANNELS.runCommand, async (_event, command: string, bypassConfirmation?: boolean) => {
    const input = commandSchema.parse(command);
    return runtime.runCommand(input, Boolean(bypassConfirmation));
  });

  ipcMain.handle(IPC_CHANNELS.setMode, async (_event, mode: MissionMode) => {
    return runtime.setMode(mode);
  });

  ipcMain.handle(IPC_CHANNELS.completeReminder, async (_event, id: string) => {
    return runtime.completeReminder(id);
  });

  ipcMain.handle(IPC_CHANNELS.replayCommand, async (_event, id: string) => {
    return runtime.replayCommand(id);
  });

  ipcMain.handle(IPC_CHANNELS.generateBriefing, async () => runtime.generateBriefing());
  ipcMain.handle(IPC_CHANNELS.reloadPlugins, async () => runtime.reloadPlugins());
};
