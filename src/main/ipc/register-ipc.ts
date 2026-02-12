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
  ipcMain.handle(IPC_CHANNELS.setAutomationEnabled, async (_event, id: string, enabled: boolean) => {
    return runtime.setAutomationEnabled(id, Boolean(enabled));
  });
  ipcMain.handle(IPC_CHANNELS.setPluginEnabled, async (_event, pluginId: string, enabled: boolean) => {
    return runtime.setPluginEnabled(pluginId, Boolean(enabled));
  });
  ipcMain.handle(
    IPC_CHANNELS.terminateProcess,
    async (_event, pid: number, bypassConfirmation?: boolean) => {
      return runtime.terminateProcess(Number(pid), Boolean(bypassConfirmation));
    }
  );
};
