import { describe, expect, it } from "vitest";
import {
  assertSessionTransition,
  canTransitionSession,
  clientTransition,
  InvalidTransitionError,
  isTerminalSession,
  SESSION_TRANSITIONS,
} from "./state-machine";
import { SESSION_STATUSES } from "@repo/shared";

describe("session state machine", () => {
  it("defines transitions for every status", () => {
    for (const status of SESSION_STATUSES) expect(SESSION_TRANSITIONS[status]).toBeDefined();
  });

  it("allows the normal interview lifecycle", () => {
    const path = [
      "CREATED",
      "READY",
      "STARTING",
      "WAITING_FOR_CANDIDATE",
      "PROCESSING_ANSWER",
      "GENERATING_RESPONSE",
      "WAITING_FOR_CANDIDATE",
      "FINISHING",
      "COMPLETED",
    ] as const;
    for (let i = 1; i < path.length; i += 1)
      expect(() => assertSessionTransition(path[i - 1]!, path[i]!)).not.toThrow();
  });

  it("never allows a completed interview to resume", () => {
    expect(canTransitionSession("COMPLETED", "WAITING_FOR_CANDIDATE")).toBe(false);
    expect(() => assertSessionTransition("COMPLETED", "PROCESSING_ANSWER")).toThrow(
      InvalidTransitionError,
    );
    expect(isTerminalSession("COMPLETED")).toBe(true);
    expect(isTerminalSession("PAUSED")).toBe(false);
  });

  it("supports pause and recovery", () => {
    expect(canTransitionSession("PROCESSING_ANSWER", "PAUSED")).toBe(true);
    expect(canTransitionSession("PAUSED", "WAITING_FOR_CANDIDATE")).toBe(true);
    expect(canTransitionSession("CREATED", "PROCESSING_ANSWER")).toBe(false);
  });
});

describe("client conversational state machine", () => {
  it("prevents both parties speaking at once via barge-in", () => {
    let s = clientTransition("IDLE", { type: "CONNECT" });
    s = clientTransition(s, { type: "CONNECTED" });
    s = clientTransition(s, { type: "AI_SPEECH_STARTED" });
    expect(s).toBe("AI_SPEAKING");
    s = clientTransition(s, { type: "INTERRUPT" });
    expect(s).toBe("CANDIDATE_SPEAKING");
    // A late "AI finished" callback must not flip the floor back.
    expect(clientTransition(s, { type: "AI_SPEECH_FINISHED" })).toBe("CANDIDATE_SPEAKING");
  });

  it("handles answer submission, response and reconnection", () => {
    let s = clientTransition("WAITING", { type: "ANSWER_SUBMITTED" });
    expect(s).toBe("PROCESSING");
    s = clientTransition(s, { type: "CONNECTION_LOST" });
    expect(s).toBe("RECONNECTING");
    s = clientTransition(s, { type: "CONNECTION_RESTORED" });
    expect(s).toBe("WAITING");
    s = clientTransition(s, { type: "RESPONSE_RECEIVED", speak: true });
    expect(s).toBe("AI_SPEAKING");
  });

  it("is terminal once completed", () => {
    expect(clientTransition("COMPLETED", { type: "CONNECT" })).toBe("COMPLETED");
  });
});
