import type { SessionStatus } from "@repo/shared";

/**
 * Explicit, validated state machines (spec §21, §102).
 *
 * SERVER: persisted InterviewSession.status. Transitions are enforced by
 *         `assertSessionTransition` before every status write.
 * CLIENT: the interview room's conversational state (who is speaking), which
 *         includes transient states the server never persists.
 */

export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  CREATED: ["READY", "EXPIRED", "FAILED"],
  READY: ["STARTING", "EXPIRED", "FAILED", "FINISHING"],
  STARTING: ["WAITING_FOR_CANDIDATE", "AI_SPEAKING", "PAUSED", "FAILED", "FINISHING"],
  AI_SPEAKING: [
    "WAITING_FOR_CANDIDATE",
    "CANDIDATE_SPEAKING",
    "PAUSED",
    "RECONNECTING",
    "FINISHING",
    "FAILED",
  ],
  WAITING_FOR_CANDIDATE: [
    "CANDIDATE_SPEAKING",
    "PROCESSING_ANSWER",
    "AI_SPEAKING",
    "PAUSED",
    "RECONNECTING",
    "FINISHING",
    "FAILED",
    "EXPIRED",
  ],
  CANDIDATE_SPEAKING: [
    "PROCESSING_ANSWER",
    "WAITING_FOR_CANDIDATE",
    "PAUSED",
    "RECONNECTING",
    "FINISHING",
    "FAILED",
  ],
  PROCESSING_ANSWER: [
    "GENERATING_RESPONSE",
    "WAITING_FOR_CANDIDATE",
    "PAUSED",
    "FINISHING",
    "FAILED",
  ],
  GENERATING_RESPONSE: ["AI_SPEAKING", "WAITING_FOR_CANDIDATE", "PAUSED", "FINISHING", "FAILED"],
  PAUSED: [
    "WAITING_FOR_CANDIDATE",
    "PROCESSING_ANSWER",
    "RECONNECTING",
    "FINISHING",
    "FAILED",
    "EXPIRED",
  ],
  RECONNECTING: ["WAITING_FOR_CANDIDATE", "PAUSED", "FINISHING", "FAILED"],
  FINISHING: ["COMPLETED", "FAILED"],
  // Terminal states. A failed session is never resumed: the candidate starts a new attempt if the
  // invitation still allows one (maxAttempts), or the recruiter resends the invitation.
  COMPLETED: [],
  FAILED: [],
  EXPIRED: [],
};

export const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = [
  "COMPLETED",
  "FAILED",
  "EXPIRED",
];

/** Statuses in which the candidate is actively interviewing. */
export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  "STARTING",
  "AI_SPEAKING",
  "WAITING_FOR_CANDIDATE",
  "CANDIDATE_SPEAKING",
  "PROCESSING_ANSWER",
  "GENERATING_RESPONSE",
  "PAUSED",
  "RECONNECTING",
];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: SessionStatus,
    readonly to: SessionStatus,
  ) {
    super(`Invalid interview session transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return from === to || SESSION_TRANSITIONS[from].includes(to);
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminalSession(status: SessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

export function isActiveSession(status: SessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.includes(status);
}

// ───────────────────────── Client conversational machine ─────────────────────────

export const CLIENT_STATES = [
  "IDLE",
  "CONNECTING",
  "AI_SPEAKING",
  "WAITING",
  "CANDIDATE_SPEAKING",
  "PROCESSING",
  "PAUSED",
  "RECONNECTING",
  "COMPLETED",
  "ERROR",
] as const;
export type ClientState = (typeof CLIENT_STATES)[number];

export type ClientEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "AI_SPEECH_STARTED" }
  | { type: "AI_SPEECH_FINISHED" }
  | { type: "CANDIDATE_SPEECH_STARTED" }
  | { type: "CANDIDATE_SPEECH_CANCELLED" }
  | { type: "ANSWER_SUBMITTED" }
  | { type: "RESPONSE_RECEIVED"; speak: boolean }
  | { type: "INTERRUPT" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CONNECTION_LOST" }
  | { type: "CONNECTION_RESTORED" }
  | { type: "COMPLETED" }
  | { type: "FAILED" };

/**
 * Pure transition function for the interview room. Returns the same state for
 * events that are not valid in the current state (ignored, never throws), so a
 * late audio callback can't push the room into an impossible state — e.g. both
 * the AI and the candidate "speaking" at once.
 */
export function clientTransition(state: ClientState, event: ClientEvent): ClientState {
  if (state === "COMPLETED") return state;
  switch (event.type) {
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "ERROR";
    case "CONNECTION_LOST":
      return state === "IDLE" ? state : "RECONNECTING";
    case "CONNECTION_RESTORED":
      return state === "RECONNECTING" ? "WAITING" : state;
    case "PAUSE":
      return ["AI_SPEAKING", "WAITING", "CANDIDATE_SPEAKING"].includes(state) ? "PAUSED" : state;
    case "RESUME":
      return state === "PAUSED" ? "WAITING" : state;
    case "CONNECT":
      return state === "IDLE" || state === "ERROR" ? "CONNECTING" : state;
    case "CONNECTED":
      return state === "CONNECTING" ? "WAITING" : state;
    case "AI_SPEECH_STARTED":
      return state === "PROCESSING" || state === "WAITING" || state === "CONNECTING"
        ? "AI_SPEAKING"
        : state;
    case "AI_SPEECH_FINISHED":
      return state === "AI_SPEAKING" ? "WAITING" : state;
    case "INTERRUPT":
      // Barge-in: stop the AI voice and hand the floor to the candidate.
      return state === "AI_SPEAKING" ? "CANDIDATE_SPEAKING" : state;
    case "CANDIDATE_SPEECH_STARTED":
      return state === "WAITING"
        ? "CANDIDATE_SPEAKING"
        : state === "AI_SPEAKING"
          ? "CANDIDATE_SPEAKING"
          : state;
    case "CANDIDATE_SPEECH_CANCELLED":
      return state === "CANDIDATE_SPEAKING" ? "WAITING" : state;
    case "ANSWER_SUBMITTED":
      return state === "WAITING" || state === "CANDIDATE_SPEAKING" ? "PROCESSING" : state;
    case "RESPONSE_RECEIVED":
      return state === "PROCESSING" || state === "CONNECTING" || state === "WAITING"
        ? event.speak
          ? "AI_SPEAKING"
          : "WAITING"
        : state;
  }
}
