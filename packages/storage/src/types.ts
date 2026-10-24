/**
 * Vendor-neutral object storage. Business logic only ever sees this interface;
 * S3, Cloudflare R2 and Supabase Storage are all served by the S3-compatible
 * implementation, and local development uses the filesystem.
 */
export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** Never the user's original filename (it's untrusted); used only for downloads. */
  downloadName?: string;
}

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  readonly name: string;
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Short-lived URL for direct download, or null when the provider can't sign (local). */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}

/** Hook point for malware scanning (e.g. ClamAV or a vendor API) before files are accepted. */
export interface MalwareScanner {
  scan(input: {
    body: Uint8Array;
    contentType: string;
  }): Promise<{ clean: boolean; reason?: string }>;
}

export const noopScanner: MalwareScanner = { scan: () => Promise.resolve({ clean: true }) };
