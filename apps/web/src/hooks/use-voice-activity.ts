"use client";

import { useEffect, useRef } from "react";
import { useLatest } from "./use-latest";

export interface VadOptions {
  enabled: boolean;
  getLevel: () => number;
  /** Silence after speech that ends an utterance. */
  silenceMs?: number;
  /** Continuous voice needed to count as speech (filters clicks and coughs). */
  minSpeechMs?: number;
  /** Higher sensitivity threshold multiplier, e.g. while the AI is speaking (barge-in). */
  strictness?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: (speechMs: number) => void;
}

/**
 * Energy-based voice activity detection with an adaptive noise floor.
 * Runs entirely in the browser; no audio leaves the device for VAD.
 */
export function useVoiceActivity({
  enabled,
  getLevel,
  silenceMs = 1600,
  minSpeechMs = 250,
  strictness = 1,
  onSpeechStart,
  onSpeechEnd,
}: VadOptions) {
  const callbacks = useLatest({ onSpeechStart, onSpeechEnd });
  const speakingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      speakingRef.current = false;
      return;
    }
    let floor = 0.015;
    let aboveSince = 0;
    let belowSince = 0;
    let speechStartedAt = 0;
    const tick = () => {
      const now = performance.now();
      const level = getLevel();
      // Track the ambient noise floor: fall quickly, rise slowly.
      floor = level < floor ? floor * 0.9 + level * 0.1 : floor * 0.995 + level * 0.005;
      const threshold = Math.max(0.035, floor * 2.8) * strictness;
      if (level > threshold) {
        belowSince = 0;
        if (!aboveSince) aboveSince = now;
        if (!speakingRef.current && now - aboveSince >= minSpeechMs) {
          speakingRef.current = true;
          speechStartedAt = aboveSince;
          callbacks.current.onSpeechStart?.();
        }
      } else {
        aboveSince = 0;
        if (speakingRef.current) {
          if (!belowSince) belowSince = now;
          if (now - belowSince >= silenceMs) {
            speakingRef.current = false;
            callbacks.current.onSpeechEnd?.(belowSince - speechStartedAt);
            belowSince = 0;
          }
        }
      }
    };
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [enabled, getLevel, silenceMs, minSpeechMs, strictness, callbacks]);

  return speakingRef;
}
