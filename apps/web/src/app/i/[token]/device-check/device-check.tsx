"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Keyboard, Mic, Video, Volume2, XCircle } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { CAMERA_PRIVACY_NOTE, cameraProblem, SelfView } from "@/components/interview/camera-view";
import { useCamera } from "@/hooks/use-camera";
import { useClientValue } from "@/hooks/use-latest";
import { useAudioLevel, useMicrophone } from "@/hooks/use-microphone";
import { isSpeechRecognitionSupported } from "@/hooks/use-speech-recognition";
import { useSpeechOutput } from "@/hooks/use-speech-output";

/** Microphone + speaker test with a live level meter (spec §16). */
export function DeviceCheck({
  token,
  textAllowed,
  interviewerName,
  language,
  voiceHints,
  ttsMode,
  camera: cameraEnabled,
}: {
  token: string;
  textAllowed: boolean;
  interviewerName: string;
  language: string;
  voiceHints: string[];
  ttsMode: "client" | "server";
  /** The candidate opted in to the self-view camera. */
  camera: boolean;
}) {
  const router = useRouter();
  const mic = useMicrophone();
  const camera = useCamera();
  const level = useAudioLevel(mic.getLevel, mic.status === "ready");
  const [peak, setPeak] = useState(0);
  const [heard, setHeard] = useState(false);
  const sttSupported = useClientValue(isSpeechRecognitionSupported, true);
  const tts = useSpeechOutput({
    mode: "client",
    language,
    voiceHints,
    speed: 1,
    audioUrl: () => "",
  });

  // High-water marks, updated during render (no effect round-trip).
  if (level > peak) setPeak(level);
  if (level > 0.12 && !heard) setHeard(true);

  const bars = 20;
  const active = Math.round(Math.min(1, level * 1.4) * bars);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Check your microphone</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Allow microphone access when your browser asks, then say a few words. The bars should move
          as you speak.
        </p>

        <div className="mt-6 space-y-4">
          {mic.status === "idle" || mic.status === "requesting" ? (
            <Button
              size="lg"
              onClick={() => void mic.start()}
              loading={mic.status === "requesting"}
            >
              <Mic /> Test microphone
            </Button>
          ) : null}

          {mic.status === "ready" ? (
            <>
              <div
                className="flex h-12 items-end gap-1 rounded-xl bg-muted/60 p-2"
                role="meter"
                aria-label="Microphone input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(level * 100)}
              >
                {Array.from({ length: bars }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex-1 rounded-sm transition-colors",
                      i < active ? (i > bars * 0.8 ? "bg-warning" : "bg-success") : "bg-border",
                    )}
                    style={{ height: `${30 + (i / bars) * 70}%` }}
                  />
                ))}
              </div>
              <p
                className={cn(
                  "flex items-center gap-2 text-sm",
                  heard ? "text-success-foreground" : "text-muted-foreground",
                )}
                role="status"
              >
                {heard ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <Mic className="size-4" aria-hidden="true" />
                )}
                {heard ? "We can hear you clearly." : "Say something to test your microphone…"}
              </p>
              {mic.devices.length > 1 ? (
                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="device">Microphone</Label>
                  <Select
                    value={mic.deviceId}
                    onValueChange={(id) => {
                      setHeard(false);
                      void mic.start(id);
                    }}
                  >
                    <SelectTrigger id="device">
                      <SelectValue placeholder="Default microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {mic.devices.map((d, i) => (
                        <SelectItem key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Microphone ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}

          {mic.status === "denied" || mic.status === "unavailable" || mic.status === "error" ? (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
              role="alert"
            >
              <p className="flex items-center gap-2 font-medium text-destructive">
                <XCircle className="size-4" aria-hidden="true" /> We couldn&apos;t access your
                microphone.
              </p>
              <p className="mt-1 text-muted-foreground">
                {mic.status === "denied"
                  ? "Allow microphone access in your browser's site settings (the icon next to the address bar), then try again."
                  : "No microphone was found. Connect one and try again."}
                {textAllowed ? " You can also continue by typing your answers." : ""}
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void mic.start()}>
                Try again
              </Button>
            </div>
          ) : null}

          {!sttSupported && ttsMode === "client" ? (
            <p className="text-sm text-warning-foreground">
              Your browser doesn&apos;t support voice answers for this interview. Please use Chrome,
              Edge or Safari{textAllowed ? ", or type your answers" : ""}.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="font-semibold">Check your speakers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {interviewerName} will read each question aloud.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() =>
            void tts.speak(
              `Hello, I'm ${interviewerName}. If you can hear me clearly, you're ready to begin.`,
            )
          }
          disabled={!tts.supported}
        >
          <Volume2 /> Play test sound
        </Button>
      </div>

      {cameraEnabled ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-semibold">Check your camera (optional)</h2>
          <p className="mt-1 text-sm text-muted-foreground">{CAMERA_PRIVACY_NOTE}</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <SelfView
              stream={camera.stream}
              status={camera.status}
              className="aspect-[4/3] w-full max-w-xs"
            />
            <div className="space-y-3">
              {camera.status === "ready" ? (
                <p
                  className="flex items-center gap-2 text-sm text-success-foreground"
                  role="status"
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Your camera works.
                </p>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void camera.start()}
                  loading={camera.status === "requesting"}
                >
                  <Video /> Test camera
                </Button>
              )}
              {cameraProblem(camera.status) ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {cameraProblem(camera.status)}
                </p>
              ) : null}
              {camera.status === "ready" && camera.devices.length > 1 ? (
                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="camera-device">Camera</Label>
                  <Select value={camera.deviceId} onValueChange={(id) => void camera.start(id)}>
                    <SelectTrigger id="camera-device">
                      <SelectValue placeholder="Default camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {camera.devices.map((d, i) => (
                        <SelectItem key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {textAllowed ? (
          <Button asChild variant="ghost" size="lg">
            <Link href={`/i/${token}/interview?mode=text`}>
              <Keyboard /> Continue with text
            </Link>
          </Button>
        ) : null}
        <Button
          size="lg"
          disabled={mic.status !== "ready"}
          onClick={() => {
            mic.stop();
            camera.stop();
            router.push(`/i/${token}/interview`);
          }}
        >
          Start interview
        </Button>
      </div>
    </div>
  );
}
