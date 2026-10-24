import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The integration-test database URL: TEST_DATABASE_URL, or DATABASE_URL with
 * `_test` appended to the database name. Integration tests TRUNCATE every
 * table, so we refuse any database whose name doesn't end in `_test`.
 */
export function testDatabaseUrl(): string {
  loadEnv({ path: path.join(REPO_ROOT, ".env"), quiet: true });
  const explicit = process.env.TEST_DATABASE_URL;
  let url: URL;
  if (explicit) {
    url = new URL(explicit);
  } else {
    const base = process.env.DATABASE_URL;
    if (!base) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL) to run integration tests.");
    url = new URL(base);
    const name = url.pathname.replace(/^\//, "");
    if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  }
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${dbName}": the database name must end in "_test".`,
    );
  }
  return url.toString();
}
