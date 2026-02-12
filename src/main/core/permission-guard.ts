import type { PermissionLevel } from "../../shared/contracts";

const rank: Record<PermissionLevel, number> = {
  safe: 1,
  confirm: 2,
  admin: 3
};

export class PermissionGuard {
  constructor(private readonly runtimeLevel: PermissionLevel = "admin") {}

  canRun(level: PermissionLevel): boolean {
    return rank[this.runtimeLevel] >= rank[level];
  }

  needsConfirmation(level: PermissionLevel, bypassConfirmation: boolean): boolean {
    if (bypassConfirmation) {
      return false;
    }
    return level === "confirm" || level === "admin";
  }
}
