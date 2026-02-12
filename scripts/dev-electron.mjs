import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import waitOn from "wait-on";

const rawPort = Number.parseInt(process.env.JARVIS_DEV_PORT ?? "5173", 10);
const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 5173;
const devServerUrl = process.env.JARVIS_DEV_SERVER_URL ?? `http://127.0.0.1:${port}`;
const devUserDataDir = process.env.JARVIS_DEV_USER_DATA_DIR ?? join(process.cwd(), ".jarvis-dev-user-data");

mkdirSync(devUserDataDir, { recursive: true });

await waitOn({
  resources: [`tcp:127.0.0.1:${port}`, "dist/main/main/index.js", "dist/main/main/preload.js"],
  delay: 100,
  interval: 250,
  timeout: 120_000
});

const electronCli = join(process.cwd(), "node_modules", "electron", "cli.js");

const child = spawn(process.execPath, [electronCli, "."], {
  stdio: "inherit",
  env: {
    ...process.env,
    JARVIS_DEV_SERVER_URL: devServerUrl,
    JARVIS_DEV_USER_DATA_DIR: devUserDataDir
  }
});

process.on("SIGINT", () => {
  if (!child.killed) {
    child.kill("SIGINT");
  }
});

process.on("SIGTERM", () => {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
