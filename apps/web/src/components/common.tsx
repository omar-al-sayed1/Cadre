import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { AI_DISCLAIMER } from "@repo/config";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-4 rounded-xl border bg-card px-5 py-4 transition-colors",
        href && "hover:border-foreground/20 hover:bg-muted/30",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        {label}
      </span>
      <div>
        <div className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        {hint ? <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void } | React.ReactNode;
  className?: string;
}) {
  const renderedAction =
    action && typeof action === "object" && "label" in action ? (
      action.href ? (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : (
        <Button onClick={action.onClick}>{action.label}</Button>
      )
    ) : (
      (action as React.ReactNode)
    );
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {renderedAction ? <div className="mt-5">{renderedAction}</div> : null}
    </div>
  );
}

export function AiDisclaimer({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-xs text-info-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{AI_DISCLAIMER}</span>
    </p>
  );
}

export function SkillScoreBar({
  name,
  score,
  weight,
  confidenceLevel,
  insufficient,
}: {
  name: string;
  score: number | null;
  weight?: number;
  confidenceLevel?: string | null;
  insufficient?: boolean;
}) {
  const color =
    score === null
      ? "bg-muted-foreground/30"
      : score >= 76
        ? "bg-success"
        : score >= 61
          ? "bg-info"
          : score >= 41
            ? "bg-warning"
            : "bg-destructive";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {name}
          {weight !== undefined ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{weight}%</span>
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {confidenceLevel ? (
            <span>
              {confidenceLevel.charAt(0) + confidenceLevel.slice(1).toLowerCase()} confidence
            </span>
          ) : null}
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {insufficient || score === null ? "Insufficient evidence" : `${score}/100`}
          </span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? undefined}
        aria-label={`${name} score`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            color,
            (insufficient || score === null) &&
              "bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_4px,transparent_4px_8px)] opacity-30",
          )}
          style={{ width: `${score ?? 100}%` }}
        />
      </div>
    </div>
  );
}
