import { ipcMain } from "electron";
import type { BackendRuntimeOptions, BackendRuntimeOptionsUpdate, MissionMode } from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/contracts";
import {
  backendOptionsUpdateSchema,
  commandSchema,
  customCommandCreateSchema,
  customCommandNameSchema,
  customCommandUpdateSchema,
  voiceAudioSchema,
  voiceEnabledSchema,
  voiceTranscriptSchema
} from "../../shared/schemas";
import { JarvisRuntime } from "../core/jarvis-runtime";
import { VoiceService } from "../core/voice-service";

const replaceHandler = (
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1]
): void => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
};

export interface BackendOptionsController {
  getBackendOptions: () => BackendRuntimeOptions;
  updateBackendOptions: (updates: BackendRuntimeOptionsUpdate) => Promise<BackendRuntimeOptions> | BackendRuntimeOptions;
  resetBackendOptions: () => Promise<BackendRuntimeOptions> | BackendRuntimeOptions;
}

export const registerIpcHandlers = (
  runtime: JarvisRuntime,
  voiceService: VoiceService,
  backendOptionsController?: BackendOptionsController
): void => {
  replaceHandler(IPC_CHANNELS.getState, async () => runtime.getState());

  replaceHandler(IPC_CHANNELS.runCommand, async (_event, command: string, bypassConfirmation?: boolean) => {
    const input = commandSchema.parse(command);
    return runtime.runCommand(input, Boolean(bypassConfirmation), "user");
  });

  replaceHandler(IPC_CHANNELS.setMode, async (_event, mode: MissionMode) => {
    return runtime.setMode(mode);
  });

  replaceHandler(IPC_CHANNELS.completeReminder, async (_event, id: string) => {
    return runtime.completeReminder(id);
  });

  replaceHandler(IPC_CHANNELS.replayCommand, async (_event, id: string) => {
    return runtime.replayCommand(id);
  });

  replaceHandler(IPC_CHANNELS.generateBriefing, async () => runtime.generateBriefing());
  replaceHandler(IPC_CHANNELS.reloadPlugins, async () => runtime.reloadPlugins());

  replaceHandler(IPC_CHANNELS.setAutomationEnabled, async (_event, id: string, enabled: boolean) => {
    return runtime.setAutomationEnabled(id, Boolean(enabled));
  });

  replaceHandler(IPC_CHANNELS.setPluginEnabled, async (_event, pluginId: string, enabled: boolean) => {
    return runtime.setPluginEnabled(pluginId, Boolean(enabled));
  });

  replaceHandler(
    IPC_CHANNELS.terminateProcess,
    async (_event, pid: number, bypassConfirmation?: boolean) => {
      return runtime.terminateProcess(Number(pid), Boolean(bypassConfirmation));
    }
  );

  replaceHandler(IPC_CHANNELS.createCustomCommand, async (_event, input: unknown) => {
    const payload = customCommandCreateSchema.parse(input);
    return runtime.createCustomCommand(payload);
  });

  replaceHandler(IPC_CHANNELS.updateCustomCommand, async (_event, id: string, updates: unknown) => {
    const payload = customCommandUpdateSchema.parse(updates);
    return runtime.updateCustomCommand(id, payload);
  });

  replaceHandler(IPC_CHANNELS.deleteCustomCommand, async (_event, id: string) => {
    return runtime.deleteCustomCommand(id);
  });

  replaceHandler(IPC_CHANNELS.listCustomCommands, async () => runtime.listCustomCommands());

  replaceHandler(
    IPC_CHANNELS.runCustomCommandByName,
    async (_event, name: string, bypassConfirmation?: boolean) => {
      const parsed = customCommandNameSchema.parse(name);
      return runtime.runCustomCommandByName(parsed, Boolean(bypassConfirmation));
    }
  );

  replaceHandler(IPC_CHANNELS.getVoiceStatus, async () => voiceService.getStatus());

  replaceHandler(IPC_CHANNELS.setVoiceEnabled, async (_event, enabled: boolean) => {
    const payload = voiceEnabledSchema.parse(Boolean(enabled));
    return voiceService.setEnabled(payload);
  });

  replaceHandler(IPC_CHANNELS.pushVoiceAudio, async (_event, base64Audio: string, mimeType?: string) => {
    const payload = voiceAudioSchema.parse({ base64Audio, mimeType });
    return voiceService.pushAudio(payload.base64Audio, payload.mimeType ?? "audio/wav");
  });

  replaceHandler(IPC_CHANNELS.simulateVoiceTranscript, async (_event, transcript: string) => {
    const payload = voiceTranscriptSchema.parse(transcript);
    return voiceService.simulateTranscript(payload);
  });

  replaceHandler(IPC_CHANNELS.getBackendOptions, async () => {
    if (!backendOptionsController) {
      return {
        strictOffline: runtime.getStrictOffline(),
        voice: voiceService.getConfig(),
        llm: runtime.getLlmOptions()
      };
    }

    return backendOptionsController.getBackendOptions();
  });

  replaceHandler(IPC_CHANNELS.updateBackendOptions, async (_event, updates: unknown) => {
    const payload = backendOptionsUpdateSchema.parse(updates);

    if (!backendOptionsController) {
      runtime.setStrictOffline(payload.strictOffline ?? runtime.getStrictOffline());
      runtime.setLlmOptions(payload.llm ?? {});
      await voiceService.configure(payload.voice ?? {});
      return {
        strictOffline: runtime.getStrictOffline(),
        voice: voiceService.getConfig(),
        llm: runtime.getLlmOptions()
      };
    }

    return backendOptionsController.updateBackendOptions(payload);
  });

  replaceHandler(IPC_CHANNELS.resetBackendOptions, async () => {
    if (!backendOptionsController) {
      return {
        strictOffline: runtime.getStrictOffline(),
        voice: voiceService.getConfig(),
        llm: runtime.getLlmOptions()
      };
    }

    return backendOptionsController.resetBackendOptions();
  });
};
