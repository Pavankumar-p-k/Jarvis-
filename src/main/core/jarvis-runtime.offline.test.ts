import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JarvisRuntime } from "./jarvis-runtime";

interface RuntimeFixture {
  root: string;
  dataDir: string;
  pluginsDir: string;
}

const setupFixture = (): RuntimeFixture => {
  const root = mkdtempSync(join(tmpdir(), "jarvis-runtime-"));
  const dataDir = join(root, "data");
  const pluginsDir = join(root, "plugins");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  return { root, dataDir, pluginsDir };
};

describe("JarvisRuntime strict offline", () => {
  it(
    "blocks remote URL launches",
    async () => {
    const fixture = setupFixture();
    const openExternalUrl = vi.fn(async (_url: string) => undefined);

    const runtime = new JarvisRuntime({
      dataDir: fixture.dataDir,
      pluginsDir: fixture.pluginsDir,
      strictOffline: true,
      openExternalUrl
    });

    try {
      await runtime.init();
      const response = await runtime.runCommand("open https://example.com", true);

      expect(response.result.ok).toBe(false);
      expect(response.result.message.toLowerCase()).toContain("strict offline mode");
      expect(openExternalUrl).not.toHaveBeenCalled();
    } finally {
      runtime.destroy();
      rmSync(fixture.root, { recursive: true, force: true });
    }
    },
    15_000
  );

  it(
    "allows loopback URL launches",
    async () => {
    const fixture = setupFixture();
    const openExternalUrl = vi.fn(async (_url: string) => undefined);

    const runtime = new JarvisRuntime({
      dataDir: fixture.dataDir,
      pluginsDir: fixture.pluginsDir,
      strictOffline: true,
      openExternalUrl
    });

    try {
      await runtime.init();
      const response = await runtime.runCommand("open http://127.0.0.1:11434", true);

      expect(response.result.ok).toBe(true);
      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      expect(openExternalUrl).toHaveBeenCalledWith("http://127.0.0.1:11434/");
    } finally {
      runtime.destroy();
      rmSync(fixture.root, { recursive: true, force: true });
    }
    },
    15_000
  );
});
