import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PutObjectInput, StorageProvider, StoredObject } from "./types";

/** Filesystem storage for local development. Keys are validated to stay inside the root. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes(".."))
      throw new Error("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(input: PutObjectInput): Promise<void> {
    const file = this.resolve(input.key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, input.body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: input.contentType }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.resolve(key);
    try {
      const [body, meta] = await Promise.all([
        readFile(file),
        readFile(`${file}.meta.json`, "utf8").catch(() => "{}"),
      ]);
      const contentType =
        (JSON.parse(meta) as { contentType?: string }).contentType ?? "application/octet-stream";
      return { body: new Uint8Array(body), contentType, size: body.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  signedUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
