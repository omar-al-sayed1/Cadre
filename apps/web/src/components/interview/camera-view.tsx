"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Video, VideoOff } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { useCamera, type CameraStatus } from "@/hooks/use-camera";

export const CAMERA_PRIVACY_NOTE =
  "Only you can see this. Video stays on your device — it isn't recorded, sent or assessed.";

export function cameraProblem(status: CameraStatus): string | null {
  switch (status) {
    case "denied":
      return "Camera access is blocked. Allow it in your browser's site settings, or continue without it.";
    case "unavailable":
      return "No camera was found. You can continue without it.";
    case "error":
      return "The camera couldn't start (it may be in use by another app). You can continue without it.";
    default:
      return null;
  }
}

/** Mirrored local preview of a camera stream. */
export function SelfView({
  stream,
  status,
  label = "You",
  className,
}: {
  stream: MediaStream | null;
  status: CameraStatus;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);
  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-muted", className)}>
      <video
        ref={ref}
        muted
        playsInline
        autoPlay
        aria-label="Your camera preview"
        className={cn("size-full -scale-x-100 object-cover", !stream && "invisible")}
      />
      {!stream ? (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          {status === "requesting" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <VideoOff className="size-5" aria-hidden="true" />
          )}
        </span>
      ) : null}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
        {label}
      </span>
    </div>
  );
}

/**
 * Floating self-view for the interview room, on by default for candidates who
 * opted in. Turning it off releases the camera. Camera problems never block
 * the interview.
 */
export function CameraTile({ className }: { className?: string }) {
  const camera = useCamera();
  const [on, setOn] = useState(true);
  const { start, stop } = camera;

  useEffect(() => {
    if (on) void start();
    else stop();
  }, [on, start, stop]);

  const problem = on ? cameraProblem(camera.status) : null;
  return (
    <div className={cn("w-28 sm:w-40 lg:w-48", className)}>
      <div className="group relative">
        <SelfView
          stream={on ? camera.stream : null}
          status={on ? camera.status : "idle"}
          className="aspect-[4/3] shadow-lg"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="absolute top-1.5 right-1.5 opacity-90 shadow-sm"
          aria-pressed={on}
          aria-label={on ? "Turn camera off" : "Turn camera on"}
          title={on ? "Turn camera off" : "Turn camera on"}
          onClick={() => setOn((v) => !v)}
        >
          {on ? <Video /> : <VideoOff />}
        </Button>
      </div>
      {problem ? (
        <p className="mt-1.5 rounded-md bg-background/90 p-1.5 text-[11px] text-muted-foreground shadow-sm">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
