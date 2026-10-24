"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CandidateMessageView, CandidateSessionView } from "@repo/core";
import { clientTransition, type ClientEvent } from "@repo/interview-engine/state-machine";
import type { IntegrityEventType } from "@repo/shared";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";

export interface ChatMessage extends CandidateMessageView {
  pending?: boolean;
  failed?: boolean;
}

export interface ControllerError {
  kind: "ai" | "network" | "speech" | "session" | "other";
  message: string;
  canRetry: boolean;
}

interface TurnResponse {
  aiMessage: CandidateMessageView;
  candidateMessage: CandidateMessageView;
  view: CandidateSessionView;
  replayed: boolean;
}

interface PendingAnswer {
  clientMessageId: string;
  content: string;
  source: "TEXT" | "VOICE";
  latencyMs?: number;
  transcriptConfidence?: number;
  recordingId?: string;
}

const HEARTBEAT_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Network + conversation state for the interview room. Answers are sent with
 * an idempotency key and retried with backoff, so a dropped connection never
 * duplicates or loses an answer (spec §62, §119).
 */
export function useInterviewController(sessionId: string, initial: CandidateSessionView) {
  const [clientState, dispatchRaw] = useReducer(
    clientTransition,
    initial.completed ? "COMPLETED" : "IDLE",
  );
  const [view, setView] = useState(initial);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [error, setError] = useState<ControllerError | null>(null);
  const [online, setOnline] = useState(true);
  const [remaining, setRemaining] = useState(initial.remainingSeconds);
  const pendingRef = useRef<PendingAnswer | null>(null);
  const reconnectedRef = useRef(false);
  const integrityQueue = useRef<
    Array<{
      type: IntegrityEventType;
      occurredAt: string;
      metadata: Record<string, string | number | boolean>;
    }>
  >([]);
  const lastAiAtRef = useRef<number>(0);
  useEffect(() => {
    lastAiAtRef.current = Date.now();
  }, []);

  const dispatch = useCallback((event: ClientEvent) => dispatchRaw(event), []);

  const base = `/api/interview-session/${sessionId}`;

  const completedRef = useRef(initial.completed);
  const applyView = useCallback((next: CandidateSessionView) => {
    completedRef.current = next.completed;
    setView(next);
    setRemaining(next.remainingSeconds);
  }, []);

  /** Load state and, if needed, start the conversation (welcome message). */
  const connect = useCallback(async (): Promise<CandidateMessageView | null> => {
    dispatch({ type: "CONNECT" });
    try {
      const { session } =
        initial.status === "READY" || view.status === "READY"
          ? await api<{ session: CandidateSessionView }>(`${base}/start`, {
              method: "POST",
              body: {},
            })
          : await api<{ session: CandidateSessionView }>(base);
      applyView(session);
      setMessages(session.messages);
      dispatch({ type: "CONNECTED" });
      if (session.completed) dispatch({ type: "COMPLETED" });
      lastAiAtRef.current = Date.now();
      const last = session.messages.at(-1);
      return last?.role === "AI" ? last : null;
    } catch (err) {
      dispatch({ type: "FAILED" });
      setError({
        kind: "session",
        message: err instanceof ApiError ? err.message : "We couldn't connect to your interview.",
        canRetry: true,
      });
      return null;
    }
  }, [applyView, base, dispatch, initial.status, view.status]);

  const send = useCallback(async (): Promise<TurnResponse | null> => {
    const pending = pendingRef.current;
    if (!pending) return null;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await api<TurnResponse>(`${base}/message`, {
          method: "POST",
          body: {
            clientMessageId: pending.clientMessageId,
            content: pending.content,
            source: pending.source,
            latencyMs: pending.latencyMs,
            transcriptConfidence: pending.transcriptConfidence,
            recordingId: pending.recordingId,
          },
          timeoutMs: 90_000,
        });
        if (!online) setOnline(true);
        return result;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        if (apiErr?.code === "SESSION_BUSY" && attempt < 20) {
          await sleep(1_500);
          continue;
        }
        const transient =
          !apiErr ||
          apiErr.status === 0 ||
          apiErr.code === "TIMEOUT" ||
          apiErr.code === "NETWORK" ||
          (apiErr.status >= 500 && apiErr.code !== "AI_UNAVAILABLE") ||
          apiErr.status === 429;
        if (transient && attempt < 8) {
          setOnline(false);
          dispatch({ type: "CONNECTION_LOST" });
          await sleep(Math.min(15_000, 1_000 * 2 ** attempt) + (apiErr?.retryAfter ?? 0) * 1_000);
          continue;
        }
        throw err;
      }
    }
  }, [base, dispatch, online]);

  const retryPending = useCallback(
    async (optimisticId?: string): Promise<CandidateMessageView | null> => {
      const pending = pendingRef.current;
      if (!pending) return null;
      const localId = optimisticId ?? `local-${pending.clientMessageId}`;
      setMessages((m) =>
        m.map((msg) => (msg.id === localId ? { ...msg, failed: false, pending: true } : msg)),
      );
      setError(null);
      try {
        const result = await send();
        if (!result) return null;
        pendingRef.current = null;
        if (reconnectedRef.current === false && !online) reconnectedRef.current = true;
        setOnline(true);
        dispatch({ type: "CONNECTION_RESTORED" });
        setMessages((m) => {
          const withoutLocal = m.filter(
            (msg) =>
              msg.id !== localId &&
              msg.id !== result.candidateMessage.id &&
              msg.id !== result.aiMessage.id,
          );
          return [...withoutLocal, result.candidateMessage, result.aiMessage];
        });
        applyView(result.view);
        lastAiAtRef.current = Date.now();
        return result.aiMessage;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        setMessages((m) =>
          m.map((msg) => (msg.id === localId ? { ...msg, pending: false, failed: true } : msg)),
        );
        dispatch({ type: "CONNECTION_RESTORED" });
        dispatch({ type: "PAUSE" });
        setError({
          kind: apiErr?.code === "AI_UNAVAILABLE" ? "ai" : apiErr ? "other" : "network",
          message:
            apiErr?.message ??
            "We couldn't reach the server. Your answer is saved on this device — try again.",
          canRetry: apiErr?.code !== "SESSION_STATE_CONFLICT" && apiErr?.code !== "SESSION_INVALID",
        });
        if (apiErr?.code === "SESSION_STATE_CONFLICT") pendingRef.current = null;
        return null;
      }
    },
    [applyView, dispatch, online, send],
  );

  /** Submit an answer. Resolves with the interviewer's reply (or null on failure). */
  const submit = useCallback(
    async (
      answer: Omit<PendingAnswer, "clientMessageId">,
    ): Promise<CandidateMessageView | null> => {
      if (pendingRef.current) return null;
      const clientMessageId = newIdempotencyKey();
      pendingRef.current = {
        ...answer,
        clientMessageId,
        latencyMs: answer.latencyMs ?? Date.now() - lastAiAtRef.current,
      };
      const optimisticId = `local-${clientMessageId}`;
      setMessages((m) => [
        ...m,
        {
          id: optimisticId,
          role: "CANDIDATE",
          content: answer.content || "…",
          sequenceNumber: Number.MAX_SAFE_INTEGER,
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);
      setError(null);
      dispatch({ type: "ANSWER_SUBMITTED" });
      return retryPending(optimisticId);
    },
    [dispatch, retryPending],
  );

  const finish = useCallback(async () => {
    const { session } = await api<{ session: CandidateSessionView }>(`${base}/finish`, {
      method: "POST",
      body: { idempotencyKey: newIdempotencyKey() },
    });
    applyView(session);
    setMessages(session.messages);
    return session.messages.at(-1) ?? null;
  }, [applyView, base]);

  const recordIntegrity = useCallback(
    (type: IntegrityEventType, metadata: Record<string, string | number | boolean> = {}) => {
      if (!view.integrityMonitoring || view.completed) return;
      integrityQueue.current.push({ type, occurredAt: new Date().toISOString(), metadata });
    },
    [view.integrityMonitoring, view.completed],
  );

  // Heartbeat + reconnection + server-side completion (e.g. strict time limit).
  useEffect(() => {
    if (view.completed) return;
    let stopped = false;
    const beat = async () => {
      try {
        const { session } = await api<{ session: CandidateSessionView }>(`${base}/heartbeat`, {
          method: "POST",
          body: { reconnected: reconnectedRef.current },
          timeoutMs: 10_000,
        });
        if (stopped) return;
        reconnectedRef.current = false;
        if (!online) {
          setOnline(true);
          dispatch({ type: "CONNECTION_RESTORED" });
        }
        setRemaining(session.remainingSeconds);
        if (session.completed && !view.completed) {
          applyView(session);
          setMessages(session.messages);
        }
      } catch {
        if (stopped) return;
        reconnectedRef.current = true;
        setOnline(false);
        dispatch({ type: "CONNECTION_LOST" });
      }
    };
    const id = window.setInterval(beat, HEARTBEAT_MS);
    const onOnline = () => void beat();
    const onOffline = () => {
      setOnline(false);
      dispatch({ type: "CONNECTION_LOST" });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [applyView, base, dispatch, online, view.completed]);

  // Integrity signals: objective browser events, batched (spec §54).
  useEffect(() => {
    if (!view.integrityMonitoring || view.completed) return;
    const onVisibility = () =>
      document.visibilityState === "hidden" && recordIntegrity("TAB_HIDDEN");
    const onBlur = () => recordIntegrity("WINDOW_BLUR");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    const flush = () => {
      if (integrityQueue.current.length === 0) return;
      const events = integrityQueue.current.splice(0, 50);
      void fetch(`${base}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const id = window.setInterval(flush, 5_000);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", flush);
      window.clearInterval(id);
      flush();
    };
  }, [base, recordIntegrity, view.integrityMonitoring, view.completed]);

  // Local countdown, re-synced from the server on every response.
  useEffect(() => {
    if (view.completed || clientState === "IDLE") return;
    const id = window.setInterval(() => {
      if (online) setRemaining((r) => Math.max(0, r - 1));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [clientState, online, view.completed]);

  return {
    clientState,
    dispatch,
    view,
    messages,
    error,
    setError,
    online,
    remaining,
    connect,
    submit,
    retryPending,
    hasPending: () => pendingRef.current !== null,
    /** Synchronous completion flag (state updates may not have rendered yet). */
    isCompleted: () => completedRef.current,
    finish,
    recordIntegrity,
    markAiSpoken: () => {
      lastAiAtRef.current = Date.now();
    },
  };
}
