import { getServerEnv } from "@repo/config/env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export * from "./types";
export * from "./validation";
export { LocalStorageProvider } from "./local";
export { S3StorageProvider } from "./s3";

let instance: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (instance) return instance;
  const env = getServerEnv();
  if (env.STORAGE_PROVIDER === "local") {
    instance = new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
  } else {
    instance = new S3StorageProvider({
      name: env.STORAGE_PROVIDER,
      bucket: env.STORAGE_BUCKET!,
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    });
  }
  return instance;
}

export function setStorageForTesting(provider: StorageProvider | undefined): void {
  instance = provider;
}
