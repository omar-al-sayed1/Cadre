import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PutObjectInput, StorageProvider, StoredObject } from "./types";

export interface S3ProviderOptions {
  name: "s3" | "r2" | "supabase";
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible storage. Works with AWS S3, Cloudflare R2
 * (endpoint https://<account>.r2.cloudflarestorage.com, region "auto") and
 * Supabase Storage's S3 endpoint (https://<project>.supabase.co/storage/v1/s3,
 * forcePathStyle true).
 */
export class S3StorageProvider implements StorageProvider {
  readonly name: string;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3ProviderOptions) {
    this.name = options.name;
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? options.name === "supabase",
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
          : undefined,
    });
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentDisposition: input.downloadName
          ? `attachment; filename="${input.downloadName.replace(/[^\w.-]/g, "_")}"`
          : undefined,
        ServerSideEncryption: this.name === "s3" ? "AES256" : undefined,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = await response.Body?.transformToByteArray();
      if (!body) return null;
      return {
        body,
        contentType: response.ContentType ?? "application/octet-stream",
        size: body.byteLength,
      };
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === "NotFound")
        return false;
      throw error;
    }
  }

  signedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
