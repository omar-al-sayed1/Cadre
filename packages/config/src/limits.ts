/** Operational limits shared by client and server. */
export const LIMITS = {
  resume: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ] as const,
    allowedExtensions: [".pdf", ".docx"] as const,
  },
  logo: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  },
  audio: {
    /** One candidate utterance. ~2.5 minutes of opus audio fits comfortably. */
    maxBytes: 15 * 1024 * 1024,
    maxUtteranceSeconds: 300,
    allowedMimeTypes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"] as const,
  },
  candidateCsv: {
    maxBytes: 2 * 1024 * 1024,
    maxRows: 1000,
  },
  interview: {
    maxAnswerChars: 8_000,
    maxCodeChars: 30_000,
    minDurationMinutes: 5,
    maxDurationMinutes: 120,
    defaultDurationMinutes: 30,
    defaultMaxFollowUps: 2,
    absoluteMaxFollowUps: 4,
    /** Wrap-up begins when this fraction of the configured duration has elapsed. */
    wrapUpAtFraction: 0.9,
    /** Grace period past the configured duration before a hard stop (non-strict mode). */
    overtimeGraceSeconds: 180,
    /** A session stuck mid-turn for longer than this is considered recoverable. */
    staleTurnLockSeconds: 90,
    heartbeatIntervalSeconds: 15,
    invitationDefaultExpiryDays: 7,
    invitationDefaultMaxAttempts: 2,
  },
  memory: {
    recentTurns: 12,
    summarizeEveryTurns: 8,
    maxCandidateFacts: 40,
    maxEvidencePerSkill: 12,
  },
} as const;

/** Rate limits: [max requests, window seconds]. */
export const RATE_LIMITS = {
  authLogin: [10, 60],
  authRegister: [5, 300],
  passwordReset: [5, 900],
  invitationTokenLookup: [30, 60],
  candidateMessage: [30, 60],
  candidateAudio: [30, 60],
  candidateTts: [60, 60],
  candidateEvents: [120, 60],
  aiGeneration: [20, 300],
  fileUpload: [30, 300],
  inviteSend: [100, 3600],
  publicApi: [120, 60],
  placeSearch: [30, 60],
} as const satisfies Record<string, readonly [number, number]>;

export type RateLimitName = keyof typeof RATE_LIMITS;
