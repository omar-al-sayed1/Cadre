"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

/**
 * Microphone access with an analyser for level metering and voice activity
 * detection. Echo cancellation keeps the interviewer's voice out of the input.
 */
export function useMicrophone() {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
  }, []);

  const start = useCallback(
    async (preferredDeviceId?: string): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return false;
      }
      stop();
      setStatus("requesting");
      try {
        const id = preferredDeviceId ?? deviceId;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: id ? { exact: id } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        contextRef.current = context;
        analyserRef.current = analyser;
        bufferRef.current = new Float32Array(analyser.fftSize);
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "audioinput"));
        setDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? id);
        setStatus("ready");
        return true;
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setStatus(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "unavailable"
              : "error",
        );
        return false;
      }
    },
    [deviceId, stop],
  );

  /** Current input level, 0–1 (RMS, perceptually scaled). */
  const getLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    if (!analyser || !buffer) return 0;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i]! * buffer[i]!;
    const rms = Math.sqrt(sum / buffer.length);
    return Math.min(1, rms * 4);
  }, []);

  useEffect(() => stop, [stop]);

  return { status, devices, deviceId, start, stop, getLevel, stream: () => streamRef.current };
}

/** Poll an audio level getter at ~20 fps for meters and waveforms. */
export function useAudioLevel(getLevel: () => number, active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 50) {
        setLevel(getLevel());
        last = t;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);
  return active ? level : 0;
}
