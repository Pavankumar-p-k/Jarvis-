import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ActionResult, AssistantState, PluginManifest, PluginState } from "../../shared/contracts";
import { pluginManifestSchema } from "../../shared/schemas";
import { Logger } from "./logger";

type PluginCommandHandler = (context: {
  command: string;
  args: string;
  state: AssistantState;
}) => Promise<unknown> | unknown;

interface CachedPluginRuntime {
  entryPath: string;
  versionToken: string;
  handler: PluginCommandHandler;
}

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
  const data = asRecord.data;

  return {
    ok,
    message,
    data
  };
};

export class PluginService {
  private readonly pluginDirs = new Map<string, string>();
  private readonly runtimeCache = new Map<string, CachedPluginRuntime>();

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
      const handler = await this.loadHandler(plugin);
      const rawPrefix = plugin.manifest.entryCommand.trim();
      const args = command.trim().slice(rawPrefix.length).trim();
      const result = await handler({ command, args, state });
      return toActionResult(result);
    } catch (error) {
      this.logger.warn(`Plugin execution failed: ${plugin.manifest.id}`, error);
      return {
        ok: false,
        message: `Plugin ${plugin.manifest.name} failed: ${error instanceof Error ? error.message : "unknown error"}`
      };
    }
  }

  private async loadHandler(plugin: PluginState): Promise<PluginCommandHandler> {
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
    const baseWithSep = `${safeBase}${safeBase.endsWith("\\") ? "" : "\\"}`.toLowerCase();
    if (!entryPath.toLowerCase().startsWith(baseWithSep) && entryPath.toLowerCase() !== safeBase.toLowerCase()) {
      throw new Error("Plugin entry path escapes plugin directory.");
    }

    if (!existsSync(entryPath)) {
      throw new Error(`Plugin entry file not found: ${entry}`);
    }

    const stat = statSync(entryPath);
    const versionToken = `${stat.mtimeMs}-${stat.size}`;
    const cached = this.runtimeCache.get(plugin.manifest.id);
    if (cached && cached.entryPath === entryPath && cached.versionToken === versionToken) {
      return cached.handler;
    }

    const moduleUrl = `${pathToFileURL(entryPath).href}?v=${encodeURIComponent(versionToken)}`;
    const loaded = (await import(moduleUrl)) as {
      handle?: unknown;
      default?: unknown;
    };

    const candidate = loaded.default ?? loaded;
    const fromObject =
      candidate && typeof candidate === "object"
        ? (candidate as { handle?: unknown }).handle
        : undefined;

    const handlerCandidate = [loaded.handle, fromObject, candidate].find((item) => typeof item === "function");

    if (typeof handlerCandidate !== "function") {
      throw new Error("Plugin entry must export a function or a handle() method.");
    }

    const handler = handlerCandidate as PluginCommandHandler;
    this.runtimeCache.set(plugin.manifest.id, {
      entryPath,
      versionToken,
      handler
    });

    return handler;
  }
}
