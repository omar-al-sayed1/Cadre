/**
 * Feature flag catalogue. Runtime state (global toggles, rollout percentage and
 * per-company overrides) lives in the database; these are the defaults used
 * when no row exists.
 */
export const FEATURE_FLAGS = {
  voiceInterviews: { default: true, description: "Voice (speech) interviews" },
  camera: {
    default: true,
    description:
      "Optional candidate camera preview (each company still opts in; video never leaves the device)",
  },
  codingQuestions: { default: false, description: "Coding questions with sandboxed execution" },
  resumeParsing: { default: true, description: "AI resume parsing and resume-aware questions" },
  adaptiveQuestions: { default: true, description: "Adaptive difficulty and dynamic questions" },
  integrityMonitoring: { default: true, description: "Objective interview integrity signals" },
  candidateFeedback: { default: true, description: "Post-interview candidate experience survey" },
  multilingualInterviews: {
    default: false,
    description: "Interviews in languages other than English",
  },
  aiQuestionGeneration: { default: true, description: "Generate interview structure with AI" },
} as const satisfies Record<string, { default: boolean; description: string }>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return value in FEATURE_FLAGS;
}
