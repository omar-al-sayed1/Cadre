import { CheckCheck, Check, HelpCircle, Minus, X } from "lucide-react";
import type { CandidateStage, ConfidenceLevel, JobStatus, Recommendation } from "@repo/shared";
import { RECOMMENDATION_META, scoreBand } from "@repo/scoring";
import { Badge } from "@repo/ui/badge";
import { cn } from "@repo/ui/cn";
import { JOB_STATUS_LABELS, STAGE_LABELS } from "@/lib/format";

const REC_ICONS = {
  "double-check": CheckCheck,
  check: Check,
  minus: Minus,
  x: X,
  help: HelpCircle,
} as const;
const REC_VARIANT = {
  "positive-strong": "success",
  positive: "success",
  neutral: "warning",
  negative: "danger",
  muted: "muted",
} as const;

/** Recommendation badge: icon + text, never colour alone (spec §129). */
export function RecommendationBadge({
  value,
  className,
  size = "default",
}: {
  value: Recommendation | null | undefined;
  className?: string;
  size?: "default" | "lg";
}) {
  if (!value) return <Badge variant="muted">Pending</Badge>;
  const meta = RECOMMENDATION_META[value];
  const Icon = REC_ICONS[meta.icon];
  return (
    <Badge
      variant={REC_VARIANT[meta.tone]}
      className={cn(size === "lg" && "px-2.5 py-1 text-sm [&>svg]:size-4", className)}
      title={meta.description}
    >
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function ScoreBadge({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined)
    return <span className={cn("text-sm text-muted-foreground", className)}>—</span>;
  const band = scoreBand(score);
  const tone =
    score >= 76
      ? "text-success-foreground bg-success/10 border-success/25"
      : score >= 61
        ? "text-info-foreground bg-info/10 border-info/25"
        : score >= 41
          ? "text-warning-foreground bg-warning/10 border-warning/30"
          : "text-destructive bg-destructive/10 border-destructive/25";
  return (
    <span
      className={cn(
        "inline-flex min-w-11 items-center justify-center rounded-md border px-1.5 py-0.5 text-sm font-semibold tabular-nums",
        tone,
        className,
      )}
      title={`${score}/100 — ${band.label}`}
    >
      {score}
    </span>
  );
}

export function ConfidenceBadge({
  level,
  className,
}: {
  level: ConfidenceLevel | null | undefined;
  className?: string;
}) {
  if (!level) return null;
  const dots = level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : 1;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={`${level.toLowerCase()} confidence`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full", i <= dots ? "bg-foreground/70" : "bg-border")}
          />
        ))}
      </span>
      {level.charAt(0) + level.slice(1).toLowerCase()} confidence
    </span>
  );
}

const STAGE_VARIANT: Record<
  CandidateStage,
  "muted" | "info" | "secondary" | "success" | "danger" | "warning" | "outline"
> = {
  INVITED: "outline",
  OPENED: "outline",
  STARTED: "info",
  COMPLETED: "secondary",
  UNDER_REVIEW: "warning",
  SHORTLISTED: "success",
  OFFER: "success",
  HIRED: "success",
  REJECTED: "danger",
  EXPIRED: "muted",
  WITHDRAWN: "muted",
};

export function StageBadge({ stage }: { stage: CandidateStage | string }) {
  const s = stage as CandidateStage;
  return <Badge variant={STAGE_VARIANT[s] ?? "outline"}>{STAGE_LABELS[s] ?? stage}</Badge>;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const variant =
    status === "ACTIVE"
      ? "success"
      : status === "PAUSED"
        ? "warning"
        : status === "DRAFT"
          ? "outline"
          : "muted";
  return (
    <Badge variant={variant}>
      {status === "ACTIVE" ? (
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
      ) : null}
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}
