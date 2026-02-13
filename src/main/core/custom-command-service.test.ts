import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { CustomCommand } from "../../shared/contracts";
import { CustomCommandService } from "./custom-command-service";

const makeTempPath = (): { dir: string; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-custom-cmd-"));
  return {
    dir,
    file: join(dir, "custom-commands.json")
  };
};

describe("CustomCommandService", () => {
  it("migrates seed commands into dedicated JSON storage", () => {
    const temp = makeTempPath();
    try {
      const service = new CustomCommandService(temp.file);
      const seed: CustomCommand[] = [
        {
          id: "cc_1",
          name: "Start Sprint",
          trigger: "start sprint",
          action: "run routine focus sprint",
          passThroughArgs: false,
          enabled: true,
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString()
        }
      ];

      const loaded = service.init(seed);

      expect(loaded).toHaveLength(1);
      expect(existsSync(temp.file)).toBe(true);

      const raw = JSON.parse(readFileSync(temp.file, "utf8")) as CustomCommand[];
      expect(raw).toHaveLength(1);
      expect(raw[0].trigger).toBe("start sprint");
    } finally {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  });

  it("supports create, update, and delete operations", () => {
    const temp = makeTempPath();
    try {
      const service = new CustomCommandService(temp.file);
      service.init([]);

      const created = service.create({
        name: "Open Notes",
        trigger: "notes",
        action: "open notepad"
      });

      expect(created.name).toBe("Open Notes");
      expect(service.list()).toHaveLength(1);

      const updated = service.update(created.id, {
        action: "open vscode",
        passThroughArgs: true
      });

      expect(updated.action).toBe("open vscode");
      expect(updated.passThroughArgs).toBe(true);

      const removed = service.delete(created.id);
      expect(removed.id).toBe(created.id);
      expect(service.list()).toHaveLength(0);
    } finally {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  });

  it("matches runtime commands and builds target actions", () => {
    const temp = makeTempPath();
    try {
      const service = new CustomCommandService(temp.file);
      service.init([]);
      service.create({
        name: "Search Local",
        trigger: "search",
        action: "open http://127.0.0.1:8080/?q={args}",
        passThroughArgs: true
      });

      const match = service.match("search offline stt models");
      expect(match).toBeDefined();

      if (!match) {
        throw new Error("Expected custom command to match.");
      }

      const target = service.buildTarget(match.command, match.args);
      expect(target).toContain("offline stt models");
    } finally {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  });
});
