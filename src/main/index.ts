import { app, BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VoiceEvent } from "../shared/contracts";
import { IPC_CHANNELS } from "../shared/contracts";
import { JarvisRuntime } from "./core/jarvis-runtime";
import { VoiceService } from "./core/voice-service";
import { registerIpcHandlers } from "./ipc/register-ipc";

const isDev = Boolean(process.env.JARVIS_DEV_SERVER_URL);

if (isDev) {
  const devUserData = process.env.JARVIS_DEV_USER_DATA_DIR ?? join(process.cwd(), ".jarvis-dev-user-data");
  const devSessionData = join(devUserData, "session");
  mkdirSync(devSessionData, { recursive: true });
  app.setPath("userData", devUserData);
  app.setPath("sessionData", devSessionData);
  app.commandLine.appendSwitch("disk-cache-dir", join(devSessionData, "cache"));
}

const createWindow = async (): Promise<void> => {
  const runtime = new JarvisRuntime({
    dataDir: join(app.getPath("userData"), "data"),
    pluginsDir: join(process.cwd(), "plugins")
  });
  await runtime.init();

  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#041217",
    title: "Jarvis",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true
    }
  });

  const sendVoiceEvent = (event: VoiceEvent): void => {
    if (win.isDestroyed()) {
      return;
    }
    win.webContents.send(IPC_CHANNELS.voiceEvent, event);
  };

  const voiceService = new VoiceService({
    wakeWord: process.env.JARVIS_WAKE_WORD ?? "jarvis",
    onCommand: async (command) => {
      const response = await runtime.runCommand(command);
      return response.result.message;
    },
    onEvent: sendVoiceEvent,
    whisperCliPath: process.env.JARVIS_WHISPER_CPP,
    whisperModelPath: process.env.JARVIS_WHISPER_MODEL
  });
  await voiceService.init();

  registerIpcHandlers(runtime, voiceService);

  if (isDev) {
    await win.loadURL(process.env.JARVIS_DEV_SERVER_URL as string);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  win.on("closed", () => {
    voiceService.destroy();
    runtime.destroy();
  });
};

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
