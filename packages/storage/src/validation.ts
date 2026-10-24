import { randomBytes } from "node:crypto";

/**
 * Upload validation (spec §74). The declared MIME type and extension are
 * untrusted; we verify the file's magic bytes match an allowed type and
 * reject executables outright.
 */

export type DetectedType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "audio/webm"
  | "audio/ogg"
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/wav"
  | "text/csv";

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));

/** Identify the real file type from its leading bytes. */
export function sniffType(bytes: Uint8Array): DetectedType | "executable" | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [0x4d, 0x5a])) return "executable"; // MZ (PE/Windows)
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "executable"; // ELF
  if (startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]))
    return "executable"; // Mach-O
  if (startsWith(bytes, [0x23, 0x21])) return "executable"; // #! script
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container: DOCX must contain word/ entries.
    const head = ascii(bytes, 0, Math.min(bytes.length, 4_000));
    if (head.includes("word/") || head.includes("[Content_Types].xml")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return null;
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return "audio/wav";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm"; // EBML (WebM/Matroska)
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 4, 8) === "ftyp") return "audio/mp4";
  if (
    startsWith(bytes, [0x49, 0x44, 0x33]) ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  return null;
}

export interface UploadRules {
  maxBytes: number;
  allowedTypes: readonly string[];
}

export type UploadCheck =
  | { ok: true; type: DetectedType; extension: string }
  | { ok: false; code: "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE"; message: string };

const EXTENSIONS: Record<DetectedType, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "text/csv": ".csv",
};

export function validateUpload(bytes: Uint8Array, rules: UploadRules): UploadCheck {
  if (bytes.byteLength === 0)
    return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE", message: "The file is empty." };
  if (bytes.byteLength > rules.maxBytes) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `Files must be smaller than ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`,
    };
  }
  const type = sniffType(bytes);
  if (type === "executable")
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Executable files are not allowed.",
    };
  if (!type || !rules.allowedTypes.includes(type)) {
    return {
      ok: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "This file type isn't supported.",
    };
  }
  return { ok: true, type, extension: EXTENSIONS[type] };
}

/** Random, non-guessable storage key. Original filenames are never used in keys. */
export function storageKey(prefix: string, extension: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9/_-]/g, "");
  const now = new Date();
  const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${safePrefix}/${datePath}/${randomBytes(16).toString("hex")}${extension}`;
}

/** Display-safe version of an untrusted original filename (for UI only). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";
}
