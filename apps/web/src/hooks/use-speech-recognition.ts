"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typings for the Web Speech API (not in TypeScript's DOM lib). */
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

const LANG_TAGS: Record<string, string> = { en: "en-US", ar: "ar-SA", fr: "fr-FR", es: "es-ES" };

/**
 * Streaming recognition with interim results (spec §20). Recognition restarts
 * automatically if the browser stops it mid-answer.
 */
export function useSpeechRecognition(language: string) {
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const activeRef = useRef(false);
  const finalRef = useRef<string[]>([]);
  const confidenceRef = useRef<number[]>([]);
  const interimRef = useRef("");

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      return false;
    }
    finalRef.current = [];
    confidenceRef.current = [];
    interimRef.current = "";
    setInterim("");
    setError(null);
    activeRef.current = true;
    const recognition = new Ctor();
    recognition.lang = LANG_TAGS[language] ?? language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          finalRef.current.push(alt.transcript.trim());
          if (alt.confidence > 0) confidenceRef.current.push(alt.confidence);
        } else {
          interimText += alt.transcript;
        }
      }
      interimRef.current = interimText.trim();
      setInterim([...finalRef.current, interimRef.current].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        activeRef.current = false;
        setError("denied");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
      }
    };
    recognition.onend = () => {
      // Chrome ends recognition after pauses; keep listening while the answer is open.
      if (activeRef.current) {
        try {
          recognition.start();
        } catch {
          // already started
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // ignore double start
    }
    return true;
  }, [language]);

  /** Stop and return the full transcript of the utterance. */
  const stop = useCallback((): { text: string; confidence: number | null } => {
    activeRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    const text = [...finalRef.current, interimRef.current]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const confidences = confidenceRef.current;
    const confidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    return { text, confidence };
  }, []);

  const abort = useCallback(() => {
    activeRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setInterim("");
  }, []);

  useEffect(() => abort, [abort]);

  return { start, stop, abort, interim, error, clearInterim: () => setInterim("") };
}
