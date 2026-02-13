import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type CreateCustomCommandInput,
  type JarvisApi,
  type MissionMode,
  type UpdateCustomCommandInput,
  type VoiceEvent
} from "../shared/contracts";

const api: JarvisApi = {
  getState: async () => ipcRenderer.invoke(IPC_CHANNELS.getState),
  runCommand: async (command: string, bypassConfirmation = false) =>
    ipcRenderer.invoke(IPC_CHANNELS.runCommand, command, bypassConfirmation),
  setMode: async (mode: MissionMode) => ipcRenderer.invoke(IPC_CHANNELS.setMode, mode),
  completeReminder: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.completeReminder, id),
  replayCommand: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.replayCommand, id),
  generateBriefing: async () => ipcRenderer.invoke(IPC_CHANNELS.generateBriefing),
  reloadPlugins: async () => ipcRenderer.invoke(IPC_CHANNELS.reloadPlugins),
  setAutomationEnabled: async (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setAutomationEnabled, id, enabled),
  setPluginEnabled: async (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setPluginEnabled, pluginId, enabled),
  terminateProcess: async (pid: number, bypassConfirmation = false) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminateProcess, pid, bypassConfirmation),
  createCustomCommand: async (input: CreateCustomCommandInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCustomCommand, input),
  updateCustomCommand: async (id: string, updates: UpdateCustomCommandInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateCustomCommand, id, updates),
  deleteCustomCommand: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deleteCustomCommand, id),
  getVoiceStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.getVoiceStatus),
  setVoiceEnabled: async (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setVoiceEnabled, enabled),
  pushVoiceAudio: async (base64Audio: string, mimeType = "audio/webm") =>
    ipcRenderer.invoke(IPC_CHANNELS.pushVoiceAudio, base64Audio, mimeType),
  simulateVoiceTranscript: async (transcript: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.simulateVoiceTranscript, transcript),
  onVoiceEvent: (listener: (event: VoiceEvent) => void) => {
    const wrapped = (_event: unknown, payload: VoiceEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.voiceEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.voiceEvent, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("jarvisApi", api);
