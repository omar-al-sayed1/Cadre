import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Single .env at the monorepo root.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const isProd = process.env.NODE_ENV === "production";

/** Map tiles for the Find leads map (OpenStreetMap unless NEXT_PUBLIC_MAP_TILE_URL is set). */
const mapTileOrigin = new URL(
  (
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  ).replace(/\{[a-z]\}/g, "0"),
).origin;

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://lh3.googleusercontent.com ${mapTileOrigin}`,
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(self), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@repo/ai",
    "@repo/config",
    "@repo/core",
    "@repo/database",
    "@repo/email",
    "@repo/interview-engine",
    "@repo/queue",
    "@repo/sales-engine",
    "@repo/scoring",
    "@repo/shared",
    "@repo/storage",
    "@repo/ui",
    "@repo/validation",
    "@repo/voice",
  ],
  serverExternalPackages: [
    "pg",
    "@prisma/adapter-pg",
    "unpdf",
    "mammoth",
    "nodemailer",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
