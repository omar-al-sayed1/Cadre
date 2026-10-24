import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: [
            "packages/*/src/**/*.integration.test.ts",
            "apps/*/src/**/*.integration.test.ts",
          ],
          globalSetup: ["./packages/core/src/testing/integration-global-setup.ts"],
          setupFiles: ["./packages/core/src/testing/integration-setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
