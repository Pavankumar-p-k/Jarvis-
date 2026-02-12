import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { JarvisRuntime } from "./core/jarvis-runtime";
import { registerIpcHandlers } from "./ipc/register-ipc";

const isDev = Boolean(process.env.JARVIS_DEV_SERVER_URL);

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
      sandbox: true,
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
