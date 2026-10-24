import Link from "next/link";
import type { LeadOverview } from "@repo/core";
import type { LeadStatus } from "@repo/shared";
import { cn } from "@repo/ui/cn";

/** Pipeline stages in order (some group two statuses). */
export const PIPELINE_STAGES: Array<{
  key: string;
  label: string;
  statuses: LeadStatus[];
  bar: string;
}> = [
  { key: "new", label: "New", statuses: ["NEW", "RESEARCHING"], bar: "bg-muted-foreground/35" },
  { key: "qualified", label: "Qualified", statuses: ["QUALIFIED"], bar: "bg-primary/45" },
  { key: "contacted", label: "Contacted", statuses: ["CONTACTED"], bar: "bg-info/60" },
  { key: "engaged", label: "Engaged", statuses: ["ENGAGED", "INTERESTED"], bar: "bg-info" },
  {
    key: "meeting",
    label: "Meeting",
    statuses: ["MEETING_REQUESTED", "MEETING_BOOKED"],
    bar: "bg-warning",
  },
  {
    key: "proposal",
    label: "Proposal",
    statuses: ["PROPOSAL", "NEGOTIATION"],
    bar: "bg-primary/75",
  },
  { key: "won", label: "Won", statuses: ["WON"], bar: "bg-success" },
];

export const CLOSED_STATUSES: LeadStatus[] = ["LOST", "UNQUALIFIED", "DO_NOT_CONTACT"];

type PipelineCounts = Pick<LeadOverview, "total" | "byStatus">;

const count = (overview: PipelineCounts, statuses: LeadStatus[]) =>
  statuses.reduce((n, s) => n + (overview.byStatus[s] ?? 0), 0);

/**
 * The whole pipeline at a glance: a proportional bar plus one link per stage
 * (click to filter the list).
 */
export function PipelineStrip({
  overview,
  activeStatus,
  hrefFor,
}: {
  overview: PipelineCounts;
  /** The current `status` filter (comma-separated); null means "All"; omit to highlight nothing. */
  activeStatus?: string | null;
  hrefFor: (status: string | null) => string;
}) {
  const stages = PIPELINE_STAGES.map((s) => ({ ...s, n: count(overview, s.statuses) }));
  const closed = count(overview, CLOSED_STATUSES);
  const open = stages.reduce((n, s) => n + s.n, 0);
  return (
    <nav aria-label="Pipeline stages" className="rounded-xl border bg-card">
      <div className="flex h-1.5 overflow-hidden rounded-t-xl bg-muted" aria-hidden="true">
        {stages.map((s) =>
          s.n > 0 ? (
            <span
              key={s.key}
              className={s.bar}
              style={{ width: `${(s.n / Math.max(open, 1)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ol className="scrollbar-none flex overflow-x-auto">
        <li className="flex">
          <StageLink
            href={hrefFor(null)}
            label="All"
            n={overview.total}
            active={activeStatus === null}
          />
        </li>
        {stages.map((s) => {
          const value = s.statuses.join(",");
          return (
            <li key={s.key} className="flex">
              <StageLink
                href={hrefFor(value)}
                label={s.label}
                n={s.n}
                active={activeStatus === value}
                dot={s.bar}
              />
            </li>
          );
        })}
        <li className="ml-auto flex border-l">
          <StageLink
            href={hrefFor(CLOSED_STATUSES.join(","))}
            label="Closed"
            n={closed}
            active={activeStatus === CLOSED_STATUSES.join(",")}
            muted
          />
        </li>
      </ol>
    </nav>
  );
}

function StageLink({
  href,
  label,
  n,
  active,
  dot,
  muted,
}: {
  href: string;
  label: string;
  n: number;
  active: boolean;
  dot?: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex min-w-24 flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50",
        active && "bg-muted/60",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          active && "text-foreground",
        )}
      >
        {dot ? <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "text-lg leading-none font-semibold tabular-nums",
          muted && "text-muted-foreground",
          n === 0 && "text-muted-foreground/60",
        )}
      >
        {n}
      </span>
      {active ? (
        <span
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}
