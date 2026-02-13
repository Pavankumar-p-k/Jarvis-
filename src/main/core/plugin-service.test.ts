import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildDefaultState } from "../../shared/defaults";
import { Logger } from "./logger";
import { PluginService } from "./plugin-service";

const setupPluginDir = (entrySource = "exports.handle = async ({ args }) => ({ ok: true, message: `hello ${args}` });"): { root: string } => {
  const root = mkdtempSync(join(tmpdir(), "jarvis-plugin-"));
  const pluginDir = join(root, "hello-plugin");
  mkdirSync(pluginDir, { recursive: true });

  writeFileSync(
    join(pluginDir, "manifest.json"),
    JSON.stringify(
      {
        id: "hello-plugin",
        name: "Hello Plugin",
        version: "1.0.0",
        description: "Test plugin",
        entryCommand: "/hello",
        entry: "index.js",
        permissionLevel: "safe"
      },
      null,
      2
    ),
    "utf8"
  );

  writeFileSync(
    join(pluginDir, "index.js"),
    entrySource,
    "utf8"
  );

  return { root };
};

describe("PluginService", () => {
  it("loads manifests and runs plugin entries in worker sandbox", async () => {
    const fixture = setupPluginDir();

    try {
      const service = new PluginService(fixture.root, new Logger());
      const plugins = service.loadPlugins();

      expect(plugins).toHaveLength(1);

      const result = await service.executeCommand(plugins[0], "/hello world", buildDefaultState());
      expect(result.ok).toBe(true);
      expect(result.message).toContain("hello world");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("blocks plugin outbound network attempts in strict offline sandbox", async () => {
    const fixture = setupPluginDir(
      "exports.handle = async () => { await fetch('https://example.com'); return { ok: true, message: 'unexpected' }; };"
    );

    try {
      const service = new PluginService(fixture.root, new Logger());
      const plugins = service.loadPlugins();
      const result = await service.executeCommand(plugins[0], "/hello", buildDefaultState());

      expect(result.ok).toBe(false);
      expect(result.message.toLowerCase()).toContain("offline mode blocked");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
