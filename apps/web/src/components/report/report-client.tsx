"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Play,
  RefreshCw,
  Search,
  Square,
  ThumbsDown,
  ThumbsUp,
  Pencil,
  MinusCircle,
} from "lucide-react";
import {
  FEEDBACK_ACCURACIES,
  RECOMMENDATIONS,
  type FeedbackAccuracy,
  type Recommendation,
} from "@repo/shared";
import { RECOMMENDATION_META } from "@repo/scoring";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/dialog";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";

const fail = (e: unknown) =>
  toast.error(e instanceof ApiError ? e.message : "Something went wrong.");

/** Poll for the evaluation while it is being generated. */
export function AutoRefresh({
  active,
  intervalMs = 4_000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}

export function OverrideDialog({
  sessionId,
  score,
  recommendation,
}: {
  sessionId: string;
  score: number | null;
  recommendation: Recommendation | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(score?.toString() ?? "");
  const [rec, setRec] = useState<string>(recommendation ?? "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Override
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override AI evaluation</DialogTitle>
          <DialogDescription>
            Your adjustment is shown alongside the original AI result and recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ov-score">Score (0–100)</Label>
            <Input
              id="ov-score"
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ov-rec">Recommendation</Label>
            <Select value={rec} onValueChange={setRec}>
              <SelectTrigger id="ov-rec">
                <SelectValue placeholder="Keep AI recommendation" />
              </SelectTrigger>
              <SelectContent>
                {RECOMMENDATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RECOMMENDATION_META[r].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ov-reason">Reason (required)</Label>
            <Textarea
              id="ov-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Follow-up call showed stronger SQL knowledge than the interview captured."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={loading}
            disabled={!reason.trim()}
            onClick={async () => {
              setLoading(true);
              try {
                await api(`/api/interviews/${sessionId}/override`, {
                  method: "POST",
                  body: {
                    score: value === "" ? null : Math.max(0, Math.min(100, Number(value))),
                    recommendation: rec || null,
                    reason,
                  },
                });
                toast.success("Override saved");
                setOpen(false);
                router.refresh();
              } catch (e) {
                fail(e);
              } finally {
                setLoading(false);
              }
            }}
          >
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACCURACY_UI: Record<FeedbackAccuracy, { label: string; icon: typeof ThumbsUp }> = {
  ACCURATE: { label: "Accurate", icon: ThumbsUp },
  PARTIALLY_ACCURATE: { label: "Partially accurate", icon: MinusCircle },
  INACCURATE: { label: "Inaccurate", icon: ThumbsDown },
};

export function AiFeedback({
  sessionId,
  current,
}: {
  sessionId: string;
  current: { accuracy: FeedbackAccuracy; correction: string | null } | null;
}) {
  const [accuracy, setAccuracy] = useState<FeedbackAccuracy | null>(current?.accuracy ?? null);
  const [correction, setCorrection] = useState(current?.correction ?? "");
  const [saving, setSaving] = useState(false);
  const save = async (value: FeedbackAccuracy, text = correction) => {
    setSaving(true);
    try {
      await api(`/api/interviews/${sessionId}/feedback`, {
        method: "POST",
        body: { accuracy: value, correction: text || null },
      });
      toast.success("Thanks — feedback recorded");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Bot className="size-4 text-muted-foreground" aria-hidden="true" /> How accurate was this AI
        assessment?
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="AI assessment accuracy">
        {FEEDBACK_ACCURACIES.map((a) => {
          const Icon = ACCURACY_UI[a].icon;
          return (
            <Button
              key={a}
              size="sm"
              variant={accuracy === a ? "default" : "outline"}
              role="radio"
              aria-checked={accuracy === a}
              disabled={saving}
              onClick={() => {
                setAccuracy(a);
                void save(a);
              }}
            >
              <Icon /> {ACCURACY_UI[a].label}
            </Button>
          );
        })}
      </div>
      {accuracy && accuracy !== "ACCURATE" ? (
        <div className="space-y-2">
          <Label htmlFor="correction" className="text-xs text-muted-foreground">
            What did the AI get wrong? (optional)
          </Label>
          <Textarea
            id="correction"
            rows={2}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => void save(accuracy)} loading={saving}>
            Save correction
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ReevaluateButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await api(`/api/interviews/${sessionId}/reevaluate`, { method: "POST", body: {} });
          toast.success("Re-evaluation queued");
          router.refresh();
        } catch (e) {
          fail(e);
        } finally {
          setLoading(false);
        }
      }}
    >
      <RefreshCw /> Re-run evaluation
    </Button>
  );
}

export function TerminateButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          <Square /> End interview
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this interview?</DialogTitle>
          <DialogDescription>
            The candidate&apos;s session closes and the answers so far are evaluated. This is
            recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={async () => {
              try {
                await api(`/api/interviews/${sessionId}/terminate`, {
                  method: "POST",
                  body: { reason },
                });
                setOpen(false);
                router.refresh();
              } catch (e) {
                fail(e);
              }
            }}
          >
            End interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface TranscriptLine {
  id: string;
  role: "AI" | "CANDIDATE" | "SYSTEM_EVENT";
  content: string;
  offsetSeconds: number;
  recordingId: string | null;
}

function stamp(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** Searchable transcript with timestamps and per-answer audio playback (spec §45). */
export function TranscriptViewer({
  lines,
  interviewerName,
  candidateName,
}: {
  lines: TranscriptLine[];
  interviewerName: string;
  candidateName: string;
}) {
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio] = useState(() => (typeof Audio !== "undefined" ? new Audio() : null));
  useEffect(() => () => audio?.pause(), [audio]);
  const filtered = useMemo(
    () =>
      query.trim()
        ? lines.filter((l) => l.content.toLowerCase().includes(query.trim().toLowerCase()))
        : lines,
    [lines, query],
  );
  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="rounded bg-warning/40 px-0.5 text-foreground">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search transcript"
          placeholder="Search transcript"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? <p className="text-sm text-muted-foreground">No matches.</p> : null}
      <ol className="space-y-4">
        {filtered.map((line) => (
          <li key={line.id} className="grid grid-cols-[52px_1fr] gap-3">
            <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
              {stamp(line.offsetSeconds)}
            </span>
            <div>
              <p
                className={cn(
                  "text-xs font-semibold",
                  line.role === "AI" ? "text-primary" : "text-foreground",
                )}
              >
                {line.role === "AI" ? `${interviewerName} (AI)` : candidateName}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line">
                {highlight(line.content)}
              </p>
              {line.recordingId && audio ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 px-2 text-xs"
                  onClick={() => {
                    if (playing === line.recordingId) {
                      audio.pause();
                      setPlaying(null);
                      return;
                    }
                    audio.src = `/api/recordings/${line.recordingId}`;
                    audio.onended = () => setPlaying(null);
                    void audio.play();
                    setPlaying(line.recordingId);
                  }}
                >
                  {playing === line.recordingId ? <Square /> : <Play />}{" "}
                  {playing === line.recordingId ? "Stop" : "Play audio"}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
