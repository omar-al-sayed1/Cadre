"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechOutputOptions {
  mode: "client" | "server";
  language: string;
  voiceHints: string[];
  speed: number;
  /** Builds the streaming audio URL for server-side synthesis. */
  audioUrl: (messageId: string) => string;
}

const LANG_PREFIX: Record<string, string> = { en: "en", ar: "ar", fr: "fr", es: "es" };

function pickVoice(language: string, hints: string[]): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = LANG_PREFIX[language] ?? language;
  const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  for (const hint of hints) {
    const match = candidates.find((v) => v.name.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match;
  }
  return candidates.find((v) => /natural|neural|online/i.test(v.name)) ?? candidates[0] ?? null;
}

/** Split long text into sentence chunks (works around browsers cutting long utterances). */
function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 220 && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Interviewer voice output. Browser speech synthesis (demo / zero-cost) or
 * streamed server TTS. `stop()` supports barge-in.
 */
export function useSpeechOutput({
  mode,
  language,
  voiceHints,
  speed,
  audioUrl,
}: SpeechOutputOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Voices load asynchronously in some browsers.
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const finish = useCallback(() => {
    setSpeaking(false);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    finish();
  }, [finish]);

  const speakBrowser = useCallback(
    (text: string, token: number) =>
      new Promise<void>((resolve) => {
        const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
        if (!synth) return resolve();
        synth.cancel();
        const voice = pickVoice(language, voiceHints);
        const parts = chunk(text);
        let index = 0;
        const next = () => {
          if (token !== tokenRef.current || index >= parts.length) return resolve();
          const utterance = new SpeechSynthesisUtterance(parts[index]!);
          index += 1;
          if (voice) utterance.voice = voice;
          utterance.lang = voice?.lang ?? language;
          utterance.rate = speed;
          utterance.volume = volume;
          utterance.onend = next;
          utterance.onerror = () => resolve();
          synth.speak(utterance);
        };
        next();
      }),
    [language, voiceHints, speed, volume],
  );

  const speakServer = useCallback(
    (messageId: string, token: number) =>
      new Promise<boolean>((resolve) => {
        audioRef.current ??= new Audio();
        const audio = audioRef.current;
        audio.volume = volume;
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.src = audioUrl(messageId);
        audio.play().catch(() => resolve(false));
        if (token !== tokenRef.current) resolve(true);
      }),
    [audioUrl, volume],
  );

  const speak = useCallback(
    async (text: string, messageId?: string): Promise<void> => {
      stop();
      const token = ++tokenRef.current;
      setSpeaking(true);
      await new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        void (async () => {
          if (mode === "server" && messageId) {
            const ok = await speakServer(messageId, token);
            // Fall back to the browser voice if server audio fails.
            if (!ok && token === tokenRef.current) await speakBrowser(text, token);
          } else {
            await speakBrowser(text, token);
          }
          if (token === tokenRef.current) finish();
        })();
      });
    },
    [mode, speakBrowser, speakServer, stop, finish],
  );

  useEffect(() => stop, [stop]);

  const supported =
    mode === "server" || (typeof window !== "undefined" && "speechSynthesis" in window);
  return { speak, stop, speaking, volume, setVolume, supported };
}
