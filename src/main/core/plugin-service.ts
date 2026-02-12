import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginManifest, PluginState } from "../../shared/contracts";
import { pluginManifestSchema } from "../../shared/schemas";
import { Logger } from "./logger";

export class PluginService {
  constructor(
    private readonly pluginsDir: string,
    private readonly logger: Logger
  ) {}

  loadPlugins(): PluginState[] {
    if (!existsSync(this.pluginsDir)) {
      return [];
    }

    const dirs = readdirSync(this.pluginsDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory()
    );
    const loaded: PluginState[] = [];

    for (const dir of dirs) {
      const manifestPath = join(this.pluginsDir, dir.name, "manifest.json");
      if (!existsSync(manifestPath)) {
        continue;
      }
      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest;
        const manifest = pluginManifestSchema.parse(raw);
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
    return plugins.find((plugin) => text.startsWith(plugin.manifest.entryCommand.toLowerCase()));
  }
}
