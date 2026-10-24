/**
 * Centralised platform branding. Renaming the platform only requires changing
 * these values (or setting NEXT_PUBLIC_APP_NAME / APP_NAME). Individual AI
 * employees are named in ./products.ts.
 */
const envName =
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_APP_NAME ?? process.env.APP_NAME)) ||
  undefined;

export const brand = {
  /** Platform name, shown in the logo, titles and emails. */
  productName: envName ?? "Cadre",
  shortName: "Cadre",
  tagline: "Build your AI workforce.",
  description:
    "AI employees that help your business hire, sell, support customers, and automate everyday work.",
  defaultInterviewerName: "Ava",
  supportEmail: "support@example.com",
  legal: {
    termsUrl: "/legal/terms",
    privacyUrl: "/legal/privacy",
  },
} as const;

/** Versions of candidate-facing policies. Bump when the text changes so consent records stay accurate. */
export const POLICY_VERSIONS = {
  terms: "2026-10-01",
  privacy: "2026-10-01",
  aiInterview: "2026-10-01",
  recording: "2026-10-01",
  camera: "2026-10-09",
} as const;

export const AI_DISCLAIMER =
  "AI-generated evaluation. Review candidate evidence before making employment decisions.";
