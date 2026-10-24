import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

/**
 * Prisma client singleton.
 *
 * In development Next.js hot-reloads modules; caching the client on globalThis
 * prevents exhausting Postgres connections with a new pool per reload.
 */
type DatabaseClient = InstanceType<typeof PrismaClient>;

const globalForDb = globalThis as unknown as { __db?: DatabaseClient };

function createClient(): DatabaseClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10);
  const adapter = new PrismaPg({ connectionString, max: Number.isFinite(poolMax) ? poolMax : 10 });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/** Lazily-created client so importing this module never opens a connection by itself. */
export function getDb(): DatabaseClient {
  if (!globalForDb.__db) {
    globalForDb.__db = createClient();
  }
  return globalForDb.__db;
}

export const db: DatabaseClient = new Proxy({} as DatabaseClient, {
  get(_target, property) {
    const client = getDb();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export type { DatabaseClient };

/** Transaction client type (the `tx` passed to `db.$transaction(async (tx) => …)`). */
export type TransactionClient = Parameters<Parameters<DatabaseClient["$transaction"]>[0]>[0];

export async function disconnectDb(): Promise<void> {
  if (globalForDb.__db) {
    await globalForDb.__db.$disconnect();
    globalForDb.__db = undefined;
  }
}
