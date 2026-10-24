#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker.
 *
 * Starts a real PostgreSQL server (binaries from the `embedded-postgres` npm
 * package) with data stored in ./.data/postgres. Intended for development
 * machines where Docker isn't available; production should use a managed
 * PostgreSQL instance.
 *
 *   pnpm dev:db            # start (Ctrl+C to stop)
 *
 * Then set: DATABASE_URL=postgresql://postgres:postgres@localhost:54329/interviewer
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".data", "postgres");
const port = Number.parseInt(process.env.DEV_DB_PORT ?? "54329", 10);
const databases = (process.env.DEV_DB_NAMES ?? "interviewer,interviewer_test").split(",");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // Always UTF-8, regardless of the OS locale (e.g. Windows code pages).
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
  onLog: () => {},
  onError: (message) => console.error("[postgres]", String(message).trim()),
});

async function main() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Initialising PostgreSQL cluster in ${dataDir} …`);
    await pg.initialise();
  }
  await pg.start();
  for (const name of databases) {
    try {
      await pg.createDatabase(name);
      console.log(`Created database "${name}"`);
    } catch {
      // already exists
    }
  }
  console.log(`PostgreSQL ready on port ${port}`);
  console.log(`DATABASE_URL=postgresql://postgres:postgres@localhost:${port}/${databases[0]}`);

  const shutdown = async () => {
    console.log("\nStopping PostgreSQL …");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(1);
});
