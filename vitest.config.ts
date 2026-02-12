import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage"
    }
  }
});
