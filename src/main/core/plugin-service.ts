import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { ActionResult, AssistantState, PluginManifest, PluginState } from "../../shared/contracts";
import { pluginManifestSchema } from "../../shared/schemas";
import { Logger } from "./logger";

interface WorkerPayload {
  command: string;
  args: string;
  state: AssistantState;
}

interface WorkerSuccess {
  ok: true;
  result: unknown;
}

interface WorkerFailure {
  ok: false;
  error: string;
}

const WORKER_SCRIPT = `
const { parentPort, workerData } = require("node:worker_threads");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

const blockedModuleIds = new Set(["dns", "dgram", "http", "https", "net", "tls", "undici"]);
const normalizeRequest = (request) => String(request || "").replace(/^node:/, "").toLowerCase();
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  const normalized = normalizeRequest(request);
  if (blockedModuleIds.has(normalized)) {
    throw new Error("Offline mode blocked module: " + request);
  }
  return originalLoad.call(this, request, parent, isMain);
};

globalThis.fetch = async () => {
  throw new Error("Offline mode blocked outbound network access.");
};

globalThis.XMLHttpRequest = class OfflineBlockedXmlHttpRequest {
  constructor() {
    throw new Error("Offline mode blocked outbound network access.");
  }
};

globalThis.WebSocket = class OfflineBlockedWebSocket {
  constructor() {
    throw new Error("Offline mode blocked outbound network access.");
  }
};

const resolveHandler = (loaded) => {
  if (typeof loaded === "function") {
    return loaded;
  }
  if (!loaded || typeof loaded !== "object") {
    throw new Error("Plugin module must export a function or handle().");
  }
  if (typeof loaded.handle === "function") {
    return loaded.handle;
  }
  if (typeof loaded.default === "function") {
    return loaded.default;
  }
  if (loaded.default && typeof loaded.default === "object" && typeof loaded.default.handle === "function") {
    return loaded.default.handle;
  }
  throw new Error("Plugin module must export a function or handle().");
};

(async () => {
  const moduleUrl = pathToFileURL(workerData.entryPath).href + "?v=" + Date.now();
  const loaded = await import(moduleUrl);
  const handler = resolveHandler(loaded);
  const result = await Promise.resolve(handler(workerData.payload));
  parentPort.postMessage({ ok: true, result });
})().catch((error) => {
  parentPort.postMessage({
    ok: false,
    error: error && error.message ? error.message : "Unknown plugin worker error."
  });
});
`;

const toActionResult = (value: unknown): ActionResult => {
  if (!value) {
    return { ok: true, message: "Plugin executed." };
  }

  if (typeof value === "string") {
    return { ok: true, message: value };
  }

  if (typeof value !== "object") {
    return { ok: true, message: "Plugin executed." };
  }

  const asRecord = value as Record<string, unknown>;
  const ok = typeof asRecord.ok === "boolean" ? asRecord.ok : true;
  const message = typeof asRecord.message === "string" ? asRecord.message : "Plugin executed.";

  return {
    ok,
    message,
    data: asRecord.data
  };
};

/**
 * Discovers plugin manifests and executes plugin handlers in isolated worker threads.
 */
export class PluginService {
  private readonly pluginDirs = new Map<string, string>();
  private readonly verifiedEntries = new Map<string, { entryPath: string; versionToken: string }>();

  constructor(
    private readonly pluginsDir: string,
    private readonly logger: Logger
  ) {}

  loadPlugins(): PluginState[] {
    this.pluginDirs.clear();

    if (!existsSync(this.pluginsDir)) {
      return [];
    }

    const dirs = readdirSync(this.pluginsDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory()
    );

    const loaded: PluginState[] = [];

    for (const dir of dirs) {
      const pluginDir = join(this.pluginsDir, dir.name);
      const manifestPath = join(pluginDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest;
        const manifest = pluginManifestSchema.parse(raw);
        this.pluginDirs.set(manifest.id, pluginDir);
        loaded.push({
          manifest,
          enabled: true,
          installedAtIso: new Date().toISOString()
        });
      } catch (error) {
        this.logger.warn(`Plugin skipped: ${dir.name}`, error);
      }
    }

    return loaded;
  }

  findByCommand(command: string, plugins: PluginState[]): PluginState | undefined {
    const text = command.trim().toLowerCase();
    return plugins.find(
      (plugin) => plugin.enabled && text.startsWith(plugin.manifest.entryCommand.toLowerCase())
    );
  }

  async executeCommand(
    plugin: PluginState,
    command: string,
    state: AssistantState
  ): Promise<ActionResult> {
    if (!plugin.manifest.entry) {
      return {
        ok: true,
        message: `Plugin ${plugin.manifest.name} has no executable entry. Add an entry file in manifest.json.`
      };
    }

    try {
      const entryPath = this.resolveEntryPath(plugin);
      const rawPrefix = plugin.manifest.entryCommand.trim();
      const args = command.trim().slice(rawPrefix.length).trim();

      const workerResult = await this.runInWorker(entryPath, {
        command,
        args,
        state
      });

      return toActionResult(workerResult);
    } catch (error) {
      this.logger.warn(`Plugin execution failed: ${plugin.manifest.id}`, error);
      return {
        ok: false,
        message: `Plugin ${plugin.manifest.name} failed: ${error instanceof Error ? error.message : "unknown error"}`
      };
    }
  }

  private resolveEntryPath(plugin: PluginState): string {
    const pluginDir = this.pluginDirs.get(plugin.manifest.id);
    if (!pluginDir) {
      throw new Error("Plugin directory not found.");
    }

    const entry = plugin.manifest.entry;
    if (!entry) {
      throw new Error("Plugin entry is missing.");
    }

    const safeBase = resolve(pluginDir);
    const entryPath = resolve(pluginDir, entry);

    const normalizedBase = safeBase.toLowerCase();
    const normalizedEntry = entryPath.toLowerCase();
    const prefix = `${normalizedBase}${normalizedBase.endsWith("\\") ? "" : "\\"}`;

    if (!normalizedEntry.startsWith(prefix) && normalizedEntry !== normalizedBase) {
      throw new Error("Plugin entry path escapes plugin directory.");
    }

    if (!existsSync(entryPath)) {
      throw new Error(`Plugin entry file not found: ${entry}`);
    }

    const stat = statSync(entryPath);
    const versionToken = `${stat.mtimeMs}-${stat.size}`;
    const cached = this.verifiedEntries.get(plugin.manifest.id);
    if (!cached || cached.versionToken !== versionToken || cached.entryPath !== entryPath) {
      this.verifiedEntries.set(plugin.manifest.id, {
        entryPath,
        versionToken
      });
    }

    return entryPath;
  }

  private async runInWorker(entryPath: string, payload: WorkerPayload): Promise<unknown> {
    return new Promise<unknown>((resolvePromise, rejectPromise) => {
      const worker = new Worker(WORKER_SCRIPT, {
        eval: true,
        workerData: {
          entryPath,
          payload
        },
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 64
        }
      });

      const timeout = setTimeout(() => {
        void worker.terminate();
        rejectPromise(new Error("Plugin execution timed out."));
      }, 4000);

      const cleanup = (): void => {
        clearTimeout(timeout);
      };

      worker.once("message", (message: WorkerSuccess | WorkerFailure) => {
        cleanup();
        if (!message || typeof message !== "object") {
          rejectPromise(new Error("Plugin worker sent an invalid response."));
          return;
        }

        if (message.ok) {
          resolvePromise(message.result);
          return;
        }

        rejectPromise(new Error(message.error || "Plugin worker failed."));
      });

      worker.once("error", (error) => {
        cleanup();
        rejectPromise(error);
      });

      worker.once("exit", (code) => {
        cleanup();
        if (code !== 0) {
          rejectPromise(new Error(`Plugin worker exited with code ${code}.`));
        }
      });
    });
  }
}
