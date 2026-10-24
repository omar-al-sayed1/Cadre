import { BAND_LABELS, LEAD_STATUS_META, type ScoreBand } from "@repo/sales-engine";
import type { LeadStatus } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { cn } from "@repo/ui/cn";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  const variant = meta.tone === "default" ? "secondary" : meta.tone;
  return <Badge variant={variant}>{meta.label}</Badge>;
}

const BAND_CLASSES: Record<ScoreBand, string> = {
  hot: "bg-primary text-primary-foreground",
  high: "bg-primary/15 text-primary",
  medium: "bg-info/12 text-info-foreground",
  low: "bg-muted text-muted-foreground",
  very_low: "bg-muted text-muted-foreground/80",
};

/** Score + band, e.g. "92 · Hot". Unscored leads show a dash. */
export function LeadScore({
  score,
  band,
  compact = false,
}: {
  score: number | null;
  band: ScoreBand | null;
  compact?: boolean;
}) {
  if (score === null || band === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
        BAND_CLASSES[band],
      )}
      title={`Lead score ${score}/100 (${BAND_LABELS[band]})`}
    >
      {score}
      {compact ? null : <span className="font-medium opacity-80">· {BAND_LABELS[band]}</span>}
    </span>
  );
}

export function QualificationBadge({
  status,
}: {
  status: "QUALIFIED" | "UNQUALIFIED" | "NEEDS_REVIEW";
}) {
  if (status === "QUALIFIED") return <Badge variant="success">Fits your ICP</Badge>;
  if (status === "UNQUALIFIED") return <Badge variant="muted">Not a fit</Badge>;
  return <Badge variant="warning">Needs review</Badge>;
}

/** Band label only (when the numeric score is already shown nearby). */
export function LeadBand({ band }: { band: ScoreBand }) {
  return (
    <span
      className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", BAND_CLASSES[band])}
    >
      {BAND_LABELS[band]}
    </span>
  );
}
