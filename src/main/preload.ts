import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type JarvisApi, type MissionMode } from "../shared/contracts";
import { commandSchema } from "../shared/schemas";

const api: JarvisApi = {
  getState: async () => ipcRenderer.invoke(IPC_CHANNELS.getState),
  runCommand: async (command: string, bypassConfirmation = false) =>
    ipcRenderer.invoke(IPC_CHANNELS.runCommand, commandSchema.parse(command), bypassConfirmation),
  setMode: async (mode: MissionMode) => ipcRenderer.invoke(IPC_CHANNELS.setMode, mode),
  completeReminder: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.completeReminder, id),
  replayCommand: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.replayCommand, id),
  generateBriefing: async () => ipcRenderer.invoke(IPC_CHANNELS.generateBriefing),
  reloadPlugins: async () => ipcRenderer.invoke(IPC_CHANNELS.reloadPlugins)
};

contextBridge.exposeInMainWorld("jarvisApi", api);
