"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

/**
 * Camera access for the candidate's self-view. The stream is only ever shown
 * locally — it is never recorded, uploaded or analysed.
 */
export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setStatus((s) => (s === "ready" || s === "requesting" ? "idle" : s));
  }, []);

  const start = useCallback(
    async (preferredDeviceId?: string): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return false;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setStatus("requesting");
      try {
        const id = preferredDeviceId ?? deviceId;
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: id ? { exact: id } : undefined,
            facingMode: id ? undefined : "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
        streamRef.current = next;
        setStream(next);
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "videoinput"));
        setDeviceId(next.getVideoTracks()[0]?.getSettings().deviceId ?? id);
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
    [deviceId],
  );

  // Release the camera when the component goes away.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  return { status, stream, devices, deviceId, start, stop };
}
