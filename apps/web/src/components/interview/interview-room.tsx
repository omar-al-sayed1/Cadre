"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Keyboard,
  Loader2,
  LogOut,
  MessagesSquare,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Settings2,
  Square,
  WifiOff,
  X,
} from "lucide-react";
import type { CandidateMessageView, CandidateSessionView } from "@repo/core";
import { formatClock } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/alert-dialog";
import { Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Popover, PopoverContent, PopoverTrigger, Slider, Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { useInterviewController } from "@/hooks/use-interview-controller";
import { useAudioLevel, useMicrophone } from "@/hooks/use-microphone";
import { isSpeechRecognitionSupported, useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechOutput } from "@/hooks/use-speech-output";
import { useClientValue } from "@/hooks/use-latest";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { OrbAvatar, Waveform, type AvatarRenderer, type AvatarState } from "./avatar";
import { CameraTile } from "./camera-view";
import { Transcript } from "./transcript";

const NUDGE_TEXT = [
  "",
  "Take your time. Let me know when you're ready.",
  "If you'd like, I can repeat the question.",
] as const;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

export function InterviewRoom({
  sessionId,
  token,
  initial,
  nudgeSeconds = [20, 45],
  preferredMode,
  Avatar = OrbAvatar,
}: {
  sessionId: string;
  token: string;
  initial: CandidateSessionView;
  nudgeSeconds?: [number, number];
  /** "text" when the candidate chose to type on the device check. */
  preferredMode?: "text";
  Avatar?: AvatarRenderer;
}) {
  const router = useRouter();
  const c = useInterviewController(sessionId, initial);
  const { view, clientState } = c;
  const voiceAllowed = view.responseMode !== "TEXT_ONLY";
  const textAllowed = view.responseMode !== "VOICE_ONLY";
  const clientStt = view.speech.stt === "client";
  // Server render assumes support; the real check runs on the client without a hydration mismatch.
  const sttSupported = useClientValue(() => !clientStt || isSpeechRecognitionSupported(), true);

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">(
    voiceAllowed && !(preferredMode === "text" && textAllowed) ? "voice" : "text",
  );
  const [speakQuestions, setSpeakQuestions] = useState(true);
  const [allowInterrupt, setAllowInterrupt] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [draft, setDraft] = useState("");
  const [nudge, setNudge] = useState<0 | 1 | 2>(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mic = useMicrophone();
  const recognition = useSpeechRecognition(view.language);
  const tts = useSpeechOutput({
    mode: view.speech.tts,
    language: view.language,
    voiceHints: view.interviewer.voiceHints,
    speed: view.interviewer.speed,
    audioUrl: (id) => `/api/interview-session/${sessionId}/messages/${id}/speech`,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechDetectedRef = useRef(false);
  const listeningRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleAiRef = useRef<(m: CandidateMessageView) => Promise<void>>(async () => undefined);

  const micLevel = useAudioLevel(
    mic.getLevel,
    mic.status === "ready" && (listening || tts.speaking),
  );
  const [aiLevel, setAiLevel] = useState(0);
  useEffect(() => {
    if (!tts.speaking) return;
    const id = window.setInterval(
      () => setAiLevel(0.35 + Math.abs(Math.sin(Date.now() / 140)) * 0.45 * Math.random()),
      90,
    );
    return () => window.clearInterval(id);
  }, [tts.speaking]);

  const lastAi = [...c.messages].reverse().find((m) => m.role === "AI") ?? null;

  // ── listening ──
  const startRecorder = useCallback(() => {
    const stream = mic.stream();
    if (!stream || typeof MediaRecorder === "undefined") return;
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(
        stream,
        pickRecorderMime() ? { mimeType: pickRecorderMime() } : undefined,
      );
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.start(1_000);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, [mic]);

  const stopRecorder = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        recorder.onstop = () =>
          resolve(
            chunksRef.current.length > 0
              ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
              : null,
          );
        recorder.stop();
      }),
    [],
  );

  const startListening = useCallback(() => {
    if (listeningRef.current || mic.status !== "ready") return;
    listeningRef.current = true;
    speechDetectedRef.current = false;
    setListening(true);
    setNudge(0);
    if (clientStt) recognition.start();
    if (!clientStt || view.recording) startRecorder();
  }, [clientStt, mic.status, recognition, startRecorder, view.recording]);

  const uploadAudio = useCallback(
    async (blob: Blob, transcribe: boolean) => {
      const form = new FormData();
      form.append("audio", blob, "utterance");
      const res = await fetch(
        `/api/interview-session/${sessionId}/audio?transcribe=${transcribe}`,
        { method: "POST", body: form },
      );
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ?? "Audio upload failed",
        );
      return (await res.json()) as {
        text: string | null;
        confidence: number | null;
        recordingId: string | null;
      };
    },
    [sessionId],
  );

  const finishAnswer = useCallback(async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);
    const hadSpeech = speechDetectedRef.current;
    let content = "";
    let confidence: number | undefined;
    let recordingId: string | undefined;
    try {
      if (clientStt) {
        const result = recognition.stop();
        content = result.text;
        confidence = result.confidence ?? undefined;
        const blob = await stopRecorder();
        if (blob && view.recording)
          recordingId =
            (await uploadAudio(blob, false).catch(() => null))?.recordingId ?? undefined;
      } else {
        const blob = await stopRecorder();
        if (blob) {
          setTranscribing(true);
          const result = await uploadAudio(blob, true);
          content = result.text ?? "";
          confidence = result.confidence ?? undefined;
          recordingId = result.recordingId ?? undefined;
        }
      }
    } catch {
      setTranscribing(false);
      setNotice("We couldn't process that audio. You can try again or type your answer.");
      return;
    } finally {
      setTranscribing(false);
      recognition.clearInterim();
    }
    if (!content && !hadSpeech) {
      setNotice(
        "I didn't hear anything. Tap the microphone and answer when you're ready, or type your answer.",
      );
      return;
    }
    setNotice(null);
    const reply = await c.submit({
      content,
      source: "VOICE",
      transcriptConfidence: confidence,
      recordingId,
    });
    if (reply) await handleAiRef.current(reply);
  }, [c, clientStt, recognition, stopRecorder, uploadAudio, view.recording]);

  // ── interviewer speaking ──
  const handleAiMessage = useCallback(
    async (message: CandidateMessageView) => {
      setNudge(0);
      const willSpeak = speakQuestions && voiceAllowed && tts.supported;
      c.dispatch({ type: "RESPONSE_RECEIVED", speak: willSpeak });
      if (willSpeak) {
        await tts.speak(message.content, message.id);
        c.dispatch({ type: "AI_SPEECH_FINISHED" });
      }
      c.markAiSpoken();
      if (c.isCompleted()) return;
      if (inputMode === "voice" && mic.status === "ready" && sttSupported) startListening();
      else textareaRef.current?.focus();
    },
    [c, inputMode, mic.status, speakQuestions, startListening, sttSupported, tts, voiceAllowed],
  );
  useLayoutEffect(() => {
    handleAiRef.current = handleAiMessage;
  }, [handleAiMessage]);

  // Barge-in + end-of-answer detection.
  useVoiceActivity({
    enabled:
      started &&
      mic.status === "ready" &&
      inputMode === "voice" &&
      (listening || (tts.speaking && allowInterrupt)),
    getLevel: mic.getLevel,
    strictness: tts.speaking ? 2.2 : 1,
    minSpeechMs: tts.speaking ? 400 : 250,
    silenceMs: 1_700,
    onSpeechStart: () => {
      setNudge(0);
      if (tts.speaking && allowInterrupt) {
        tts.stop();
        c.dispatch({ type: "INTERRUPT" });
        startListening();
      } else {
        c.dispatch({ type: "CANDIDATE_SPEECH_STARTED" });
      }
      speechDetectedRef.current = true;
    },
    onSpeechEnd: (speechMs) => {
      if (listeningRef.current && speechMs > 500) void finishAnswer();
    },
  });

  // Silence nudges (spec §148): gentle reminders, never a penalty.
  useEffect(() => {
    if (
      !started ||
      view.completed ||
      clientState !== "WAITING" ||
      speechDetectedRef.current ||
      draft.trim()
    ) {
      setNudge(0);
      return;
    }
    const t1 = window.setTimeout(() => setNudge(1), nudgeSeconds[0] * 1000);
    const t2 = window.setTimeout(() => setNudge(2), nudgeSeconds[1] * 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [started, view.completed, clientState, draft, nudgeSeconds, c.messages.length]);

  // Completion → thank-you page once the closing words have been spoken.
  useEffect(() => {
    if (!view.completed || tts.speaking || !started) return;
    const id = window.setTimeout(() => router.replace(`/i/${token}/complete`), 1_500);
    return () => window.clearTimeout(id);
  }, [router, started, token, tts.speaking, view.completed]);

  async function begin() {
    setStarting(true);
    if (inputMode === "voice") {
      const ok = await mic.start();
      if (!ok && textAllowed) setInputMode("text");
    }
    const last = await c.connect();
    setStarted(true);
    setStarting(false);
    if (last) await handleAiMessage(last);
  }

  async function submitText() {
    const content = draft.trim();
    if (!content || c.hasPending()) return;
    setDraft("");
    tts.stop();
    const reply = await c.submit({ content, source: "TEXT" });
    if (reply) await handleAiMessage(reply);
  }

  const avatarState: AvatarState = tts.speaking
    ? "SPEAKING"
    : clientState === "PROCESSING" || transcribing
      ? "THINKING"
      : listening
        ? "LISTENING"
        : "IDLE";
  const total = view.durationMinutes * 60;
  const lowTime = c.remaining <= 180;
  const processing = clientState === "PROCESSING" || transcribing;

  // Transcript panel: open by default on wide screens, closed on phones.
  const wide = useClientValue(() => window.matchMedia("(min-width: 1024px)").matches, true);
  const [transcriptPref, setTranscriptPref] = useState<boolean | null>(null);
  const transcriptOpen = transcriptPref ?? wide;

  // Space to talk (voice mode), unless the candidate is typing or using a control.
  useEffect(() => {
    if (!started || inputMode !== "voice" || mic.status !== "ready" || view.completed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='slider']",
        )
      )
        return;
      e.preventDefault();
      if (listeningRef.current) void finishAnswer();
      else if (!processing) {
        tts.stop();
        c.dispatch({ type: "INTERRUPT" });
        startListening();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    started,
    inputMode,
    mic.status,
    view.completed,
    processing,
    finishAnswer,
    startListening,
    tts,
    c,
  ]);

  // ── pre-start "green room" (also satisfies browser autoplay rules) ──
  if (!started) {
    const resuming = view.messages.length > 0;
    return (
      <div className="dark relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground">
        <StageBackdrop />
        <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div className="flex justify-center">
            <Avatar state="IDLE" name={view.interviewer.name} level={0} />
          </div>
          <div className="space-y-7">
            <div>
              <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
                {view.company.name}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {view.job.title}
              </h1>
              <p className="mt-3 text-muted-foreground">
                {resuming
                  ? "Welcome back. Your progress is saved — you'll continue where you left off."
                  : `About ${view.durationMinutes} minutes across ${view.progress.sectionCount} ${view.progress.sectionCount === 1 ? "section" : "sections"}. ${view.interviewer.name} will guide you through each question.`}
              </p>
            </div>

            {voiceAllowed && textAllowed ? (
              <div
                className="grid grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="How would you like to answer?"
              >
                {(
                  [
                    ["voice", Mic, "Speak", "A natural conversation"],
                    ["text", Keyboard, "Type", "Write your answers"],
                  ] as const
                ).map(([mode, Icon, label, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={inputMode === mode}
                    onClick={() => setInputMode(mode)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      inputMode === mode
                        ? "border-primary bg-primary/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-5",
                        inputMode === mode ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {inputMode === "voice" && !sttSupported ? (
              <p className="text-xs text-warning-foreground">
                Your browser doesn&apos;t support speech recognition. Use Chrome, Edge or Safari for
                voice, or answer by typing.
              </p>
            ) : null}

            <Button
              size="xl"
              className="w-full"
              onClick={begin}
              loading={starting}
              disabled={inputMode === "voice" && !sttSupported && !textAllowed}
            >
              {resuming ? "Resume interview" : "Begin interview"}
            </Button>
            {c.error ? (
              <p className="text-sm text-destructive" role="alert">
                {c.error.message}
              </p>
            ) : null}

            <ul className="grid gap-2.5 border-t border-white/10 pt-5 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />A quiet spot
                helps {view.interviewer.name} hear you clearly.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                Take your time — pauses are fine, and you can ask for a question again.
              </li>
              {inputMode === "voice" ? (
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                  Press <Kbd>Space</Kbd> to start or finish an answer.
                </li>
              ) : null}
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                People at {view.company.name} review every interview and make the decision.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const sections = Math.max(1, view.progress.sectionCount);
  const currentSection = Math.min(view.progress.sectionIndex, sections - 1);
  const timeShare = total > 0 ? Math.max(0, Math.min(1, c.remaining / total)) : 0;

  return (
    <div className="dark relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <StageBackdrop />

      {/* ── Top bar ── */}
      <header className="relative z-20 flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {view.company.logoUrl ? (
            <img src={view.company.logoUrl} alt="" className="size-8 rounded-lg object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              {view.company.name[0]}
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{view.job.title}</p>
            <p className="truncate text-xs text-muted-foreground">{view.company.name}</p>
          </div>
        </div>

        <div
          className="mx-auto hidden w-full max-w-xs flex-col gap-1.5 md:flex"
          role="progressbar"
          aria-label={`Interview ${view.progress.percent}% complete`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.progress.percent}
        >
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: sections }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 overflow-hidden rounded-full bg-white/10",
                  i < currentSection && "bg-primary",
                )}
              >
                {i === currentSection ? (
                  <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
                ) : null}
              </span>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Section {currentSection + 1} of {sections}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span
            className={cn(
              "hidden size-2 rounded-full sm:block",
              c.online ? "bg-success" : "animate-pulse bg-warning",
            )}
            title={c.online ? "Connected" : "Reconnecting"}
            aria-hidden="true"
          />
          <span
            className={cn(
              "flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3 pl-1.5 font-mono text-sm tabular-nums",
              lowTime ? "border-warning/40 text-warning-foreground" : "text-foreground/90",
            )}
            role="timer"
            aria-label={`${formatClock(c.remaining)} remaining`}
          >
            <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                strokeWidth="2.5"
                className="stroke-white/10"
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${50.27 * timeShare} 50.27`}
                className={lowTime ? "stroke-warning" : "stroke-primary"}
              />
            </svg>
            {formatClock(c.remaining)}
            <span className="sr-only"> remaining of {formatClock(total)}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={transcriptOpen ? "Hide transcript" : "Show transcript"}
            aria-expanded={transcriptOpen}
            aria-controls="transcript-panel"
            onClick={() => setTranscriptPref(!transcriptOpen)}
            className={cn(transcriptOpen && "bg-white/10")}
          >
            <MessagesSquare />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Interview settings">
                <Settings2 />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="volume">Interviewer volume</Label>
                <Slider
                  id="volume"
                  aria-label="Interviewer volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={[tts.volume]}
                  onValueChange={([v]) => tts.setVolume(v ?? 1)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="speak-questions">Read questions aloud</Label>
                <Switch
                  id="speak-questions"
                  checked={speakQuestions}
                  onCheckedChange={(v) => {
                    setSpeakQuestions(v);
                    if (!v) tts.stop();
                  }}
                />
              </div>
              {inputMode === "voice" ? (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="interrupt">Allow interrupting</Label>
                  <Switch
                    id="interrupt"
                    checked={allowInterrupt}
                    onCheckedChange={setAllowInterrupt}
                  />
                </div>
              ) : null}
              {mic.devices.length > 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mic-device">Microphone</Label>
                  <Select value={mic.deviceId} onValueChange={(id) => void mic.start(id)}>
                    <SelectTrigger id="mic-device" size="sm">
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
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmEnd(true)}
            disabled={view.completed}
          >
            <LogOut /> <span className="hidden sm:inline">End</span>
          </Button>
        </div>
      </header>

      {!c.online ? (
        <div
          className="relative z-20 mx-auto flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-4 py-1.5 text-sm text-warning-foreground"
          role="status"
        >
          <WifiOff className="size-4" aria-hidden="true" /> Connection interrupted — reconnecting.
          Your answers are safe.
        </div>
      ) : null}

      <main id="main-content" className="relative z-10 flex min-h-0 flex-1">
        {/* ── Stage ── */}
        <section
          className="relative flex min-h-0 flex-1 flex-col items-center px-4 sm:px-8"
          aria-label="Interview"
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-8 overflow-y-auto py-6">
            <Avatar
              state={avatarState}
              name={view.interviewer.name}
              level={tts.speaking ? aiLevel : micLevel}
            />

            <div className="flex min-h-28 w-full max-w-3xl flex-col items-center text-center">
              {lastAi ? (
                <p
                  key={lastAi.id}
                  className={cn(
                    "animate-in leading-snug font-medium text-balance duration-500 fade-in slide-in-from-bottom-2",
                    lastAi.content.length > 260
                      ? "text-lg sm:text-xl"
                      : lastAi.content.length > 140
                        ? "text-xl sm:text-2xl"
                        : "text-xl sm:text-[1.75rem]",
                  )}
                  aria-live="polite"
                  data-testid="interviewer-message"
                >
                  {lastAi.content}
                </p>
              ) : null}
              {recognition.interim && listening ? (
                <p className="mt-5 max-w-2xl text-base text-success-foreground/90">
                  <span className="mr-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    You
                  </span>
                  {recognition.interim}
                </p>
              ) : null}
              {processing ? (
                <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {transcribing
                    ? "Transcribing your answer…"
                    : `${view.interviewer.name} is thinking…`}
                </p>
              ) : null}
              {nudge > 0 && !processing ? (
                <p className="mt-5 text-sm text-muted-foreground" role="status">
                  {NUDGE_TEXT[nudge]}{" "}
                  {nudge === 2 && lastAi ? (
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setNudge(0);
                        void tts.speak(lastAi.content, lastAi.id);
                      }}
                    >
                      Repeat the question
                    </button>
                  ) : null}
                </p>
              ) : null}
              {notice ? (
                <p className="mt-5 text-sm text-warning-foreground" role="status">
                  {notice}
                </p>
              ) : null}
            </div>

            {c.error ? (
              <div
                className="flex w-full max-w-xl flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center"
                role="alert"
              >
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" /> {c.error.message}
                </p>
                {c.error.canRetry ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      c.dispatch({ type: "RESUME" });
                      const reply = await c.retryPending();
                      if (reply) await handleAiMessage(reply);
                    }}
                  >
                    <RefreshCw /> Try again
                  </Button>
                ) : null}
              </div>
            ) : null}

            {inputMode === "voice" &&
            (mic.status === "denied" || mic.status === "unavailable" || mic.status === "error") ? (
              <div
                className="w-full max-w-xl rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center"
                role="alert"
              >
                <p className="text-sm">
                  We couldn&apos;t access your microphone. Check your browser permissions
                  {textAllowed ? " or switch to typing" : ""}.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void mic.start()}>
                    <RefreshCw /> Retry microphone
                  </Button>
                  {textAllowed ? (
                    <Button size="sm" onClick={() => setInputMode("text")}>
                      <Keyboard /> Continue with text
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Control dock ── */}
          <div className="relative w-full max-w-3xl shrink-0 pb-5">
            {inputMode === "voice" && mic.status === "ready" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
                  {listening
                    ? "Listening — pause when you're done, or press Space."
                    : tts.speaking
                      ? allowInterrupt
                        ? "Speak anytime to interrupt."
                        : ""
                      : processing
                        ? ""
                        : "Your turn — tap the microphone or press Space."}
                </p>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-card/70 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  {textAllowed ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full"
                      aria-label="Type instead"
                      title="Type instead"
                      onClick={() => {
                        recognition.abort();
                        listeningRef.current = false;
                        setListening(false);
                        setInputMode("text");
                      }}
                    >
                      <Keyboard />
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "relative flex size-16 items-center justify-center rounded-full text-primary-foreground transition-[background-color,box-shadow] duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50",
                      listening ? "bg-destructive text-white" : "bg-primary hover:bg-primary/90",
                    )}
                    style={
                      listening
                        ? {
                            boxShadow: `0 0 0 ${4 + micLevel * 22}px color-mix(in oklch, var(--destructive) 22%, transparent)`,
                          }
                        : undefined
                    }
                    aria-label={listening ? "Stop and send answer" : "Start answering"}
                    aria-pressed={listening}
                    disabled={processing || view.completed}
                    onClick={() => {
                      if (listening) void finishAnswer();
                      else {
                        tts.stop();
                        c.dispatch({ type: "INTERRUPT" });
                        startListening();
                      }
                    }}
                  >
                    {listening ? (
                      <Square className="size-5 fill-current" />
                    ) : (
                      <Mic className="size-6" />
                    )}
                  </button>
                  {listening ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => void finishAnswer()}
                    >
                      <Send /> Finish answer
                    </Button>
                  ) : (
                    <Waveform
                      active={tts.speaking}
                      level={aiLevel}
                      bars={10}
                      className="h-8 w-20 px-2"
                    />
                  )}
                </div>
              </div>
            ) : null}

            {inputMode === "text" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitText();
                }}
                className="rounded-2xl border border-white/10 bg-card/80 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
              >
                <Label htmlFor="answer" className="sr-only">
                  Your answer
                </Label>
                <Textarea
                  id="answer"
                  ref={textareaRef}
                  rows={2}
                  value={draft}
                  maxLength={8000}
                  disabled={view.completed}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={(e) =>
                    c.recordIntegrity("PASTE", { chars: e.clipboardData.getData("text").length })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitText();
                    }
                  }}
                  placeholder="Type your answer…"
                  className="min-h-14 resize-none border-0 bg-transparent px-3 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  {voiceAllowed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        setInputMode("voice");
                        if (mic.status !== "ready") await mic.start();
                      }}
                    >
                      <Mic /> Answer by voice
                    </Button>
                  ) : (
                    <span />
                  )}
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!draft.trim() || processing || view.completed}
                  >
                    <Send /> Send answer
                  </Button>
                </div>
              </form>
            ) : null}

            {inputMode === "voice" &&
            mic.status !== "ready" &&
            mic.status !== "denied" &&
            mic.status !== "unavailable" &&
            mic.status !== "error" ? (
              <div className="flex justify-center">
                <Button onClick={() => void mic.start()}>
                  <MicOff /> Enable microphone
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Transcript ── */}
        <aside
          id="transcript-panel"
          aria-label="Transcript"
          className={cn(
            "flex-col border-white/10 bg-card/95 backdrop-blur-xl lg:bg-card/60",
            transcriptOpen
              ? "absolute inset-y-0 right-0 z-30 flex w-[min(24rem,92vw)] border-l shadow-2xl lg:static lg:z-auto lg:w-[24rem] lg:shadow-none"
              : "hidden",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Transcript</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide transcript"
              onClick={() => setTranscriptPref(false)}
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Transcript
              messages={c.messages}
              interviewerName={view.interviewer.name}
              partial={listening ? recognition.interim : ""}
              thinking={processing}
            />
          </div>
        </aside>
      </main>

      {view.camera && !view.completed ? (
        <CameraTile
          className={cn(
            "absolute bottom-6 z-20 hidden sm:block",
            transcriptOpen ? "left-6" : "right-6",
          )}
        />
      ) : null}

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the interview now?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answers so far will be submitted for review. You won&apos;t be able to continue
              this interview afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                recognition.abort();
                listeningRef.current = false;
                setListening(false);
                tts.stop();
                try {
                  const last = await c.finish();
                  if (last && last.role === "AI") await handleAiMessage(last);
                } catch {
                  c.setError({
                    kind: "network",
                    message: "We couldn't end the interview. Check your connection and try again.",
                    canRetry: false,
                  });
                }
              }}
            >
              End interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The stage's quiet backdrop: a soft glow and a faint dot grid. Decorative only. */
function StageBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-1/3 left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_65%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1.5px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-[size:22px_22px]" />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-white/15 bg-white/5 px-1.5 py-px font-mono text-[10px] text-foreground/80">
      {children}
    </kbd>
  );
}
