import { BAND_LABELS, LEAD_STATUS_META, type ScoreBand } from "@repo/sales-engine";
import type { LeadStatus } from "@repo/shared";
import { cn } from "@repo/ui/cn";

/** Two-letter initials ("Rami Khoury" → "RK", "Cedar Homes" → "CH"). */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words.at(-1)![0]}`;
  return letters.toUpperCase();
}

/** A stable hue per name, so a person keeps the same colour everywhere. */
export function hueFor(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

const AVATAR_SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-14 text-lg",
} as const;

export function LeadAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ "--h": hueFor(name) } as React.CSSProperties}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight select-none",
        "bg-[oklch(0.93_0.045_var(--h))] text-[oklch(0.38_0.09_var(--h))] dark:bg-[oklch(0.32_0.06_var(--h))] dark:text-[oklch(0.9_0.06_var(--h))]",
        AVATAR_SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

const DIAL_STROKE: Record<ScoreBand, string> = {
  hot: "stroke-primary",
  high: "stroke-primary/65",
  medium: "stroke-info",
  low: "stroke-muted-foreground/45",
  very_low: "stroke-muted-foreground/30",
};

/** Score as a ring. `label` adds the number (and band) next to it. */
export function ScoreDial({
  score,
  band,
  size = 28,
  stroke = 3,
  showValue = true,
  className,
}: {
  score: number | null;
  band: ScoreBand | null;
  size?: number;
  stroke?: number;
  showValue?: boolean;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      title={
        score === null || !band ? "Not scored" : `Lead score ${score}/100 · ${BAND_LABELS[band]}`
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        {score !== null && band ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            className={DIAL_STROKE[band]}
          />
        ) : null}
      </svg>
      {showValue ? (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
            size >= 56 ? "text-lg" : "text-[10px]",
            score === null && "text-muted-foreground",
          )}
        >
          {score ?? "–"}
        </span>
      ) : null}
    </span>
  );
}

const TONE_DOT: Record<(typeof LEAD_STATUS_META)[LeadStatus]["tone"], string> = {
  muted: "bg-muted-foreground/50",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  default: "bg-foreground/70",
};

export function statusDotClass(status: LeadStatus): string {
  return TONE_DOT[LEAD_STATUS_META[status].tone];
}

/** Quiet status label with a coloured dot. */
export function StatusPill({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", statusDotClass(status))} aria-hidden="true" />
      {LEAD_STATUS_META[status].label}
    </span>
  );
}

/** Small uppercase section label. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
