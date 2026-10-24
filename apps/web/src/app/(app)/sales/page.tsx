import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarCheck,
  ChevronRight,
  Mail,
  MessageSquareReply,
  Search,
  Sparkles,
  Target,
  Users,
  UserPlus,
} from "lucide-react";
import { can, getSalesDashboard } from "@repo/core";
import { db } from "@repo/database";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { EmptyState } from "@/components/common";
import { ActivityFeed } from "@/components/sales/activity-feed";
import { FindLeadsButton } from "@/components/sales/find-leads-button";
import { ImportLeadsDialog } from "@/components/sales/import-leads-dialog";
import { LeadFormDialog } from "@/components/sales/lead-form-dialog";
import { Eyebrow, LeadAvatar, ScoreDial, StatusPill } from "@/components/sales/lead-visuals";
import { PipelineStrip } from "@/components/sales/leads-pipeline";
import { AgentStatusToggle } from "@/components/sales/settings-editor";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "AI Sales Agent" };

const SETUP_SECTIONS = 7;

function greeting(timezone: string): string {
  let hour = new Date().getUTCHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(new Date()),
    );
  } catch {
    // Unknown timezone: UTC.
  }
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function StatusLine({
  status,
  hasLeads,
}: {
  status: "SETUP" | "ACTIVE" | "PAUSED";
  hasLeads: boolean;
}) {
  const meta = {
    ACTIVE: {
      dot: "bg-success",
      text: hasLeads
        ? "Your AI Sales Agent is working."
        : "Your AI Sales Agent is ready — add leads to get started.",
      label: "Active",
    },
    PAUSED: { dot: "bg-warning", text: "Your AI Sales Agent is paused.", label: "Paused" },
    SETUP: {
      dot: "bg-muted-foreground",
      text: "Your AI Sales Agent needs a few details before it can start.",
      label: "Setting up",
    },
  }[status];
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
        <span className="relative flex size-2" aria-hidden="true">
          {status === "ACTIVE" ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />
          ) : null}
          <span className={cn("relative size-2 rounded-full", meta.dot)} />
        </span>
        {meta.label}
      </span>
      {meta.text}
    </span>
  );
}

/** One cell of the headline numbers band. */
function Kpi({
  label,
  value,
  hint,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-3 text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        "group relative bg-card px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <ArrowUpRight
        className="absolute top-4 right-4 size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
        aria-hidden="true"
      />
      {body}
    </Link>
  ) : (
    <div className={cn("bg-card px-5 py-4", className)}>{body}</div>
  );
}

/** A monthly goal as a ring. */
function GoalRing({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number | null;
}) {
  const size = 76;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target ? Math.min(1, actual / target) : 0;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={
            target ? `${label}: ${actual} of ${target}` : `${label}: ${actual}, no goal set`
          }
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          {target ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${c * pct} ${c}`}
              className={pct >= 1 ? "stroke-success" : "stroke-primary"}
            />
          ) : null}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-base font-semibold tabular-nums">{actual}</span>
          <span className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
            {target !== null ? `of ${target}` : "no goal"}
          </span>
        </span>
      </div>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function TodayCell({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Mail;
  label: string;
  value: number | null;
  note?: string;
}) {
  return (
    <div className="bg-card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xl leading-none font-semibold tabular-nums",
          !value && "text-muted-foreground/70",
        )}
      >
        {value === null ? "—" : value}
      </p>
      {value === null && note ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)} aria-label={title}>
      <div className="flex items-end justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="mt-0.5 text-[15px] font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function SalesDashboardPage() {
  const actor = await requireActor();
  const [dash, company] = await Promise.all([
    getSalesDashboard(actor),
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { name: true, timezone: true },
    }),
  ]);
  const { stats, today, goals } = dash;
  const canWrite = can(actor, "sales.write") && dash.access.active;
  const canImport = can(actor, "sales.import") && dash.access.active;
  const setupDone = dash.agent.completedSections.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Eyebrow>AI Sales Agent</Eyebrow>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {greeting(company.timezone)}, {company.name}
          </h1>
          <div className="text-sm text-muted-foreground">
            <StatusLine status={dash.agent.status} hasLeads={stats.totalLeads > 0} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {can(actor, "sales.configure") ? <AgentStatusToggle status={dash.agent.status} /> : null}
          {canWrite ? <FindLeadsButton /> : null}
          {canImport ? <ImportLeadsDialog /> : null}
          {canWrite ? <LeadFormDialog /> : null}
        </div>
      </header>

      {!dash.agent.onboardingCompleted ? (
        <div className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-5 sm:flex-row sm:items-center">
          <Sparkles className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="font-semibold">Tell your AI Sales Agent about your business</p>
              <p className="text-sm text-muted-foreground">
                What you sell, who you sell to, and how. It uses this to score leads and advise you.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex max-w-xs flex-1 gap-1" aria-hidden="true">
                {Array.from({ length: SETUP_SECTIONS }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < setupDone ? "bg-primary" : "bg-primary/15",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {setupDone} of {SETUP_SECTIONS} steps done
              </span>
            </div>
          </div>
          <Button asChild>
            <Link href="/sales/setup">
              Continue setup <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}

      <section
        aria-label="Pipeline statistics"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-7"
      >
        <Kpi
          label="Total leads"
          href="/sales/leads"
          className="col-span-2 sm:col-span-3 lg:col-span-2"
          value={<span className="text-[2.5rem]">{stats.totalLeads.toLocaleString("en")}</span>}
          hint={
            stats.newLeads > 0 ? (
              <span className="inline-flex items-center gap-1 text-success-foreground">
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                {stats.newLeads} new this week
              </span>
            ) : (
              "No new leads this week"
            )
          }
        />
        <Kpi label="Qualified" value={stats.qualifiedLeads} hint="Qualified or further" />
        <Kpi label="Contacted" value={stats.contactedLeads} />
        <Kpi label="Interested" value={stats.interestedLeads} />
        <Kpi label="Meetings" value={stats.meetingsBooked} hint="Booked" />
        <Kpi
          label="Won"
          value={stats.customersWon}
          hint={
            stats.conversionRate === null ? "Conversion —" : `${stats.conversionRate}% of contacted`
          }
        />
      </section>

      {stats.totalLeads === 0 ? (
        <EmptyState
          icon={Users}
          title="Your sales pipeline is empty"
          description="Let's add your first prospects. Let your AI find companies that match your ideal customer, import a CSV, or add leads one by one — each one is scored against your ideal customer profile."
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
            overview={{ total: stats.totalLeads, byStatus: dash.statusCounts }}
            hrefFor={(status) => (status ? `/sales/leads?status=${status}` : "/sales/leads")}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-6">
              <Panel
                eyebrow="Priority"
                title="Focus on these leads"
                action={
                  <Button asChild variant="ghost" size="sm" className="-mr-2">
                    <Link href="/sales/leads?sort=score">
                      All leads <ArrowRight />
                    </Link>
                  </Button>
                }
              >
                {dash.priorityLeads.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-muted-foreground">
                    No open leads with a score yet.
                  </p>
                ) : (
                  <ol className="border-t">
                    {dash.priorityLeads.map((lead, i) => (
                      <li key={lead.id} className="border-b last:border-b-0">
                        <Link
                          href={`/sales/leads/${lead.id}`}
                          className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        >
                          <span className="w-4 text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </span>
                          <LeadAvatar name={lead.companyName ?? lead.fullName} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {lead.fullName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[lead.jobTitle, lead.companyName].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </span>
                          <StatusPill status={lead.status} className="hidden sm:inline-flex" />
                          <ScoreDial
                            score={lead.leadScore}
                            band={lead.score?.band ?? null}
                            size={32}
                          />
                          <ChevronRight
                            className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>

              <Panel eyebrow="Today" title="What your AI Sales Agent and team did">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t bg-border sm:grid-cols-4">
                  <TodayCell icon={UserPlus} label="Leads added" value={today.leadsAdded} />
                  <TodayCell icon={Search} label="Researched" value={today.leadsResearched} />
                  <TodayCell icon={Target} label="Scored" value={today.leadsScored} />
                  <TodayCell icon={Sparkles} label="Drafts" value={today.draftsGenerated} />
                  <TodayCell
                    icon={MessageSquareReply}
                    label="Replies"
                    value={today.responsesReceived}
                  />
                  <TodayCell icon={Bot} label="AI answers" value={today.aiAnswers} />
                  <TodayCell
                    icon={Mail}
                    label="Emails sent"
                    value={today.emailsSent}
                    note="Needs a connected mailbox"
                  />
                  <TodayCell icon={CalendarCheck} label="Meetings" value={today.meetingsBooked} />
                </div>
              </Panel>
            </div>

            <div className="min-w-0 space-y-6">
              <Panel eyebrow="This month" title="Goals">
                <div className="grid grid-cols-3 gap-2 px-4 pt-1 pb-5">
                  <GoalRing
                    label="New leads"
                    actual={goals.leads.actual}
                    target={goals.leads.target}
                  />
                  <GoalRing
                    label="Meetings"
                    actual={goals.meetings.actual}
                    target={goals.meetings.target}
                  />
                  <GoalRing
                    label="Customers"
                    actual={goals.customers.actual}
                    target={goals.customers.target}
                  />
                </div>
              </Panel>
              <Panel eyebrow="Activity" title="Latest from the AI and your team">
                <div className="max-h-[30rem] overflow-y-auto [mask-image:linear-gradient(to_bottom,black_88%,transparent)] px-5 pt-1 pb-12">
                  <ActivityFeed items={dash.activity} />
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
