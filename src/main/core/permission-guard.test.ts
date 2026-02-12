import { describe, expect, it } from "vitest";
import { PermissionGuard } from "./permission-guard";

describe("PermissionGuard", () => {
  it("allows safe actions in admin mode", () => {
    const guard = new PermissionGuard("admin");
    expect(guard.canRun("safe")).toBe(true);
  });

  it("requires confirmation for confirm/admin actions by default", () => {
    const guard = new PermissionGuard("admin");
    expect(guard.needsConfirmation("confirm", false)).toBe(true);
    expect(guard.needsConfirmation("admin", false)).toBe(true);
  });

  it("bypasses confirmation when explicitly allowed", () => {
    const guard = new PermissionGuard("admin");
    expect(guard.needsConfirmation("admin", true)).toBe(false);
  });
});
