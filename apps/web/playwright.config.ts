import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "../../packages/core/src/testing/test-database";

/**
 * End-to-end tests (spec §153 MVP flow).
 *
 * By default this builds the app and serves it on :3100 against the `_test`
 * database (never your dev data), using the system-installed Microsoft Edge so
 * no browser download is needed. Point E2E_BASE_URL at a running server to
 * skip the build.
 *
 *   pnpm dev:db          # PostgreSQL must be running
 *   pnpm test:e2e
 */
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const databaseUrl = testDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Block the microphone so the candidate takes the text path deterministically.
    permissions: [],
  },
  projects: [
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Migrate the test database, build, then serve the production bundle.
        command: `pnpm --filter @repo/database exec prisma migrate deploy && pnpm exec next build && pnpm exec next start --port ${PORT}`,
        url: `${baseURL}/api/health`,
        timeout: 5 * 60_000,
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          NODE_ENV: "production",
          DATABASE_URL: databaseUrl,
          APP_URL: baseURL,
          DEMO_MODE: "true",
          QUEUE_INLINE_WORKER: "true",
          EMAIL_PROVIDER: "console",
          AUTH_REQUIRE_EMAIL_VERIFICATION: "false",
          AUTH_TRUSTED_ORIGINS: baseURL,
        },
      },
});
