import { spawn } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_PORT = Number.parseInt(process.env.JARVIS_DEV_PORT ?? "5173", 10) || 5173;
const MAX_PORT_PROBES = 30;

const canListenOnPort = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });

const resolveDevPort = async (basePort) => {
  for (let offset = 0; offset < MAX_PORT_PROBES; offset += 1) {
    const candidate = basePort + offset;
    if (await canListenOnPort(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Unable to find an open renderer port in range ${basePort}-${basePort + MAX_PORT_PROBES - 1}.`
  );
};

const port = await resolveDevPort(DEFAULT_PORT);
if (port !== DEFAULT_PORT) {
  console.log(`[dev] Port ${DEFAULT_PORT} is in use, falling back to ${port}.`);
}

const npmCliPath = process.env.npm_execpath;
if (!npmCliPath) {
  throw new Error("npm_execpath is missing; run dev scripts through npm.");
}

const child = spawn(process.execPath, [npmCliPath, "run", "dev:stack"], {
  stdio: "inherit",
  env: {
    ...process.env,
    JARVIS_DEV_PORT: String(port),
    JARVIS_DEV_SERVER_URL: `http://127.0.0.1:${port}`
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
