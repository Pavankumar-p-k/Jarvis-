import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export class JsonStore<T> {
  constructor(private readonly filePath: string) {}

  read(defaultValue: T): T {
    try {
      if (!existsSync(this.filePath)) {
        return defaultValue;
      }
      const content = readFileSync(this.filePath, "utf8");
      return JSON.parse(content) as T;
    } catch {
      return defaultValue;
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }
}
