import type { CreateCustomCommandInput, CustomCommand, UpdateCustomCommandInput } from "../../shared/contracts";
import { createId } from "../../shared/id";
import { JsonStore } from "./json-store";

export interface CustomCommandMatch {
  command: CustomCommand;
  args: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeSpaces = (value: string): string => value.trim().replace(/\s+/g, " ");

const normalizeTrigger = (value: string): string => normalizeSpaces(value).toLowerCase();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Dedicated local persistence and matching service for user-defined custom commands.
 *
 * @example
 * const service = new CustomCommandService("C:/data/custom-commands.json");
 * service.init([]);
 * service.create({ name: "Start Sprint", trigger: "start sprint", action: "run routine focus sprint" });
 */
export class CustomCommandService {
  private readonly store: JsonStore<CustomCommand[]>;
  private commands: CustomCommand[] = [];

  constructor(filePath: string) {
    this.store = new JsonStore<CustomCommand[]>(filePath);
  }

  /**
   * Loads commands from disk, optionally migrating seed commands from legacy state.
   */
  init(seed: CustomCommand[]): CustomCommand[] {
    const loaded = this.store.read([]);

    if (loaded.length > 0) {
      this.commands = loaded.map((item) => this.normalizeStored(item));
      this.persist();
      return this.list();
    }

    const migrated = Array.isArray(seed) ? seed.map((item) => this.normalizeStored(item)) : [];
    this.commands = migrated;
    this.persist();
    return this.list();
  }

  list(): CustomCommand[] {
    return clone(this.commands);
  }

  findByNameOrTrigger(nameOrTrigger: string): CustomCommand | undefined {
    const normalized = normalizeTrigger(nameOrTrigger);
    return this.commands.find((item) => {
      return item.enabled && (item.name.trim().toLowerCase() === normalized || item.trigger === normalized);
    });
  }

  create(input: CreateCustomCommandInput): CustomCommand {
    const name = normalizeSpaces(input.name);
    const trigger = normalizeTrigger(input.trigger);
    const action = normalizeSpaces(input.action);

    if (this.hasConflict(name, trigger)) {
      throw new Error("Custom command name or trigger already exists.");
    }

    const nowIso = new Date().toISOString();
    const created: CustomCommand = {
      id: createId("cc"),
      name,
      trigger,
      action,
      passThroughArgs: Boolean(input.passThroughArgs),
      enabled: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    this.commands.unshift(created);
    this.persist();
    return clone(created);
  }

  update(id: string, updates: UpdateCustomCommandInput): CustomCommand {
    const target = this.commands.find((item) => item.id === id);
    if (!target) {
      throw new Error("Custom command not found.");
    }

    const nextName = updates.name !== undefined ? normalizeSpaces(updates.name) : target.name;
    const nextTrigger = updates.trigger !== undefined ? normalizeTrigger(updates.trigger) : target.trigger;
    const nextAction = updates.action !== undefined ? normalizeSpaces(updates.action) : target.action;

    if (this.hasConflict(nextName, nextTrigger, id)) {
      throw new Error("Another custom command already uses that name or trigger.");
    }

    target.name = nextName;
    target.trigger = nextTrigger;
    target.action = nextAction;
    if (updates.passThroughArgs !== undefined) {
      target.passThroughArgs = updates.passThroughArgs;
    }
    if (updates.enabled !== undefined) {
      target.enabled = updates.enabled;
    }
    target.updatedAtIso = new Date().toISOString();

    this.persist();
    return clone(target);
  }

  delete(id: string): CustomCommand {
    const index = this.commands.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("Custom command not found.");
    }

    const removed = this.commands[index];
    this.commands.splice(index, 1);
    this.persist();
    return clone(removed);
  }

  /**
   * Finds the best custom command match for a raw user command.
   */
  match(rawCommand: string): CustomCommandMatch | undefined {
    const normalized = normalizeSpaces(rawCommand).toLowerCase();

    const enabled = this.commands
      .filter((item) => item.enabled)
      .sort((a, b) => b.trigger.length - a.trigger.length);

    for (const item of enabled) {
      const byName = item.name.trim().toLowerCase();
      if (normalized === item.trigger || normalized === byName) {
        return { command: clone(item), args: "" };
      }

      const byTrigger = normalized.match(new RegExp(`^${escapeRegex(item.trigger)}\\s+(.+)$`, "i"));
      if (byTrigger) {
        return {
          command: clone(item),
          args: normalizeSpaces(byTrigger[1] ?? "")
        };
      }
    }

    return undefined;
  }

  /**
   * Builds the final delegated command string from a custom command + runtime args.
   */
  buildTarget(command: CustomCommand, args: string): string {
    const action = command.action.trim();
    if (!action) {
      return "";
    }

    if (action.includes("{args}")) {
      return normalizeSpaces(action.replace("{args}", args));
    }

    if (command.passThroughArgs && args) {
      return normalizeSpaces(`${action} ${args}`);
    }

    return action;
  }

  private hasConflict(name: string, trigger: string, currentId?: string): boolean {
    const normalizedName = name.trim().toLowerCase();
    const normalizedTrigger = normalizeTrigger(trigger);

    return this.commands.some((item) => {
      if (currentId && item.id === currentId) {
        return false;
      }

      return item.name.trim().toLowerCase() === normalizedName || item.trigger === normalizedTrigger;
    });
  }

  private normalizeStored(item: CustomCommand): CustomCommand {
    const nowIso = new Date().toISOString();
    return {
      id: item.id,
      name: normalizeSpaces(item.name),
      trigger: normalizeTrigger(item.trigger),
      action: normalizeSpaces(item.action),
      passThroughArgs: Boolean(item.passThroughArgs),
      enabled: item.enabled !== false,
      createdAtIso: item.createdAtIso || nowIso,
      updatedAtIso: item.updatedAtIso || nowIso
    };
  }

  private persist(): void {
    this.store.write(this.commands);
  }
}
