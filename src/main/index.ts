import { app, BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { JarvisRuntime } from "./core/jarvis-runtime";
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

  registerIpcHandlers(runtime);

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

  if (isDev) {
    await win.loadURL(process.env.JARVIS_DEV_SERVER_URL as string);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  win.on("closed", () => {
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
