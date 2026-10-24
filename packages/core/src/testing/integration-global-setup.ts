import { execSync } from "node:child_process";
import { REPO_ROOT, testDatabaseUrl } from "./test-database";

/** Runs once before the integration suite: apply migrations to the test database. */
export default function setup(): void {
  const url = testDatabaseUrl();
  try {
    execSync("corepack pnpm --filter @repo/database exec prisma migrate deploy", {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const output =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : String(error);
    throw new Error(
      `Could not migrate the test database. Is PostgreSQL running (pnpm dev:db) and does the database exist?\n${output}`,
    );
  }
}
