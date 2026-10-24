import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { can, getLeadOverview, getProductAccess, listLeads, type LeadView } from "@repo/core";
import { BAND_LABELS } from "@repo/sales-engine";
import { cn } from "@repo/ui/cn";
import { EmptyState } from "@/components/common";
import { FindLeadsButton } from "@/components/sales/find-leads-button";
import { ImportLeadsDialog } from "@/components/sales/import-leads-dialog";
import { LeadFormDialog } from "@/components/sales/lead-form-dialog";
import { LeadAvatar, ScoreDial, StatusPill } from "@/components/sales/lead-visuals";
import { PIPELINE_STAGES, PipelineStrip } from "@/components/sales/leads-pipeline";
import { LeadsToolbar } from "@/components/sales/leads-toolbar";
import { formatAgo } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Leads" };

function companyLine(lead: LeadView): string | null {
  const company = lead.companyName && lead.companyName !== lead.fullName ? lead.companyName : null;
  return company ?? lead.industry;
}

function place(lead: LeadView): string | null {
  return [lead.city, lead.country].filter(Boolean).join(", ") || lead.location;
}

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** One lead as a row: who, company, score, stage, place, owner, last activity. */
function LeadRow({ lead }: { lead: LeadView }) {
  const domain = host(lead.website);
  return (
    <li>
      <Link
        href={`/sales/leads/${lead.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_5.5rem_9.5rem_minmax(0,1.2fr)_4.5rem] lg:px-5"
      >
        <span className="flex min-w-0 items-center gap-3">
          <LeadAvatar name={lead.fullName} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium group-hover:text-primary">
              {lead.fullName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {lead.jobTitle ?? lead.email ?? (companyLine(lead) ? "" : "No details yet")}
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-sm">{companyLine(lead) ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {domain ?? lead.industry ?? ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <ScoreDial score={lead.leadScore} band={lead.score?.band ?? null} />
          <span className="hidden text-xs text-muted-foreground xl:inline">
            {lead.score?.band ? BAND_LABELS[lead.score.band] : ""}
          </span>
        </span>
        <span className="hidden md:block">
          <StatusPill status={lead.status} />
        </span>
        <span className="hidden truncate text-sm text-muted-foreground md:block">
          {place(lead) ?? "—"}
        </span>
        <span className="hidden items-center justify-end gap-2 text-xs text-muted-foreground md:flex">
          {lead.owner ? (
            <span title={`Owner: ${lead.owner.name}`}>
              <LeadAvatar name={lead.owner.name} size="xs" />
            </span>
          ) : null}
          <span className="tabular-nums" title={`Updated ${lead.updatedAt}`}>
            {formatAgo(lead.updatedAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Board: a column per pipeline stage, best leads on top. */
function LeadBoard({ leads }: { leads: LeadView[] }) {
  return (
    <div className="-mx-4 scrollbar-none overflow-x-auto px-4 pb-2 lg:-mx-0 lg:px-0">
      <div className="grid min-w-max auto-cols-[16.5rem] grid-flow-col gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const column = leads.filter((l) => stage.statuses.includes(l.status));
          return (
            <section
              key={stage.key}
              aria-label={`${stage.label}: ${column.length}`}
              className="flex max-h-[calc(100dvh-19rem)] min-h-40 flex-col rounded-xl border bg-muted/30"
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn("size-2 rounded-full", stage.bar)} aria-hidden="true" />
                <h2 className="text-[13px] font-semibold">{stage.label}</h2>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {column.length}
                </span>
              </header>
              <ul className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {column.length === 0 ? (
                  <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    No leads
                  </li>
                ) : (
                  column.map((lead) => (
                    <li key={lead.id}>
                      <Link
                        href={`/sales/leads/${lead.id}`}
                        className="block rounded-lg border bg-card p-3 transition-[border-color,transform] hover:-translate-y-px hover:border-foreground/20"
                      >
                        <span className="flex items-start gap-2.5">
                          <LeadAvatar name={lead.fullName} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {lead.fullName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {companyLine(lead) ?? lead.jobTitle ?? "—"}
                            </span>
                          </span>
                          <ScoreDial
                            score={lead.leadScore}
                            band={lead.score?.band ?? null}
                            size={26}
                          />
                        </span>
                        <span className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate">{place(lead) ?? ""}</span>
                          <span className="shrink-0 tabular-nums">{formatAgo(lead.updatedAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const board = params.view === "board";
  const [result, overview, access] = await Promise.all([
    listLeads(actor, board ? { ...params, status: undefined, page: 1, pageSize: 100 } : params),
    getLeadOverview(actor),
    getProductAccess(actor.companyId, "sales-agent"),
  ]);
  const canWrite = can(actor, "sales.write") && access.active;
  const canImport = can(actor, "sales.import") && access.active;
  const filtered = Boolean(params.q || params.status || params.band);
  const page = result.page;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
    );
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return `/sales/leads${qs ? `?${qs}` : ""}`;
  };
  const qualified =
    (overview.byStatus.QUALIFIED ?? 0) +
    PIPELINE_STAGES.slice(2).reduce(
      (n, s) => n + s.statuses.reduce((m, st) => m + (overview.byStatus[st] ?? 0), 0),
      0,
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-foreground tabular-nums">{overview.total}</span> in your pipeline
            <span className="mx-1.5 text-border">/</span>
            <span className="text-foreground tabular-nums">{overview.byBand.hot}</span> hot
            <span className="mx-1.5 text-border">/</span>
            <span className="text-foreground tabular-nums">{qualified}</span> qualified or further
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? <FindLeadsButton /> : null}
          {canImport ? <ImportLeadsDialog /> : null}
          {canWrite ? <LeadFormDialog /> : null}
        </div>
      </header>

      {overview.total === 0 ? (
        <EmptyState
          icon={Users}
          title="Your sales pipeline is empty"
          description="Let your AI find companies that match your ideal customer, import a CSV from your CRM, or add a lead manually."
          action={
            canImport || canWrite ? (
              <div className="flex flex-wrap justify-center gap-2">
                {canWrite ? <FindLeadsButton /> : null}
                {canImport ? <ImportLeadsDialog /> : null}
                {canWrite ? <LeadFormDialog /> : null}
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          <PipelineStrip
            overview={overview}
            activeStatus={board ? null : (params.status ?? null)}
            hrefFor={(status) => hrefWith({ status, view: null, page: null })}
          />
          <LeadsToolbar
            bandCounts={{
              hot: overview.byBand.hot,
              high: overview.byBand.high,
              medium: overview.byBand.medium,
              low: overview.byBand.low + overview.byBand.very_low,
              unscored: overview.byBand.unscored,
            }}
          />

          {board ? (
            <LeadBoard leads={result.items} />
          ) : result.total === 0 ? (
            <EmptyState
              icon={Users}
              title="No leads match"
              description={
                filtered ? "Try a different search or clear the filters." : "No leads yet."
              }
              action={
                filtered ? (
                  <Link
                    href="/sales/leads"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Clear filters
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_5.5rem_9.5rem_minmax(0,1.2fr)_4.5rem] gap-x-4 border-b bg-muted/30 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase md:grid">
                <span>Lead</span>
                <span>Company</span>
                <span>Score</span>
                <span>Stage</span>
                <span>Location</span>
                <span className="text-right">Active</span>
              </div>
              <ul className="divide-y">
                {result.items.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </ul>
            </div>
          )}

          {!board && result.total > 0 ? (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between text-[13px] text-muted-foreground"
            >
              <span className="tabular-nums">
                {(page - 1) * result.pageSize + 1}–{Math.min(page * result.pageSize, result.total)}{" "}
                of {result.total}
              </span>
              {pages > 1 ? (
                <span className="flex items-center gap-1">
                  {page > 1 ? (
                    <Link
                      href={hrefWith({ page: String(page - 1) })}
                      className="rounded-md border px-2.5 py-1 font-medium text-foreground hover:bg-muted"
                    >
                      Previous
                    </Link>
                  ) : null}
                  {page < pages ? (
                    <Link
                      href={hrefWith({ page: String(page + 1) })}
                      className="rounded-md border px-2.5 py-1 font-medium text-foreground hover:bg-muted"
                    >
                      Next
                    </Link>
                  ) : null}
                </span>
              ) : null}
            </nav>
          ) : null}
          {board && result.total > result.items.length ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Showing your {result.items.length} best-scoring leads.
              <Link
                href={hrefWith({ view: null })}
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                See all in the list <ArrowUpRight className="size-3" />
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
