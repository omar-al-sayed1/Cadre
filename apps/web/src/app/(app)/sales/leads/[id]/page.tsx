import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Globe,
  Link2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  allowedStatusChanges,
  can,
  getLead,
  getLatestResearch,
  getLeadRecommendations,
  getProductAccess,
  listConversations,
  listCopilotHistory,
  listSalesActivity,
  type LeadView,
} from "@repo/core";
import {
  BAND_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  RECOMMENDATION_LABELS,
} from "@repo/sales-engine";
import { isAppError } from "@repo/shared";
import { cn } from "@repo/ui/cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { ActivityFeed } from "@/components/sales/activity-feed";
import { ConversationsPanel } from "@/components/sales/conversations-panel";
import { CopilotPanel } from "@/components/sales/copilot-panel";
import { LeadMenu, LeadStageButton } from "@/components/sales/lead-actions";
import { QualificationBadge } from "@/components/sales/lead-badges";
import { LeadFormDialog } from "@/components/sales/lead-form-dialog";
import { Eyebrow, LeadAvatar, ScoreDial, StatusPill } from "@/components/sales/lead-visuals";
import { CLOSED_STATUSES, PIPELINE_STAGES } from "@/components/sales/leads-pipeline";
import { ResearchPanel } from "@/components/sales/research-panel";
import { formatAgo, formatDate } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lead = await getLead(await requireActor(), id).catch(() => null);
  return { title: lead?.fullName ?? "Lead" };
}

/** A one-click contact chip (mail, call, open site…). */
function ContactChip({
  href,
  icon: Icon,
  children,
  external,
}: {
  href?: string;
  icon: typeof Mail;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-foreground/90 transition-colors";
  const content = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </>
  );
  return href ? (
    <a
      href={href}
      className={cn(className, "hover:border-foreground/25 hover:bg-muted/40")}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
    >
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

/** Where the lead is in the pipeline: done, current and upcoming stages. */
function PipelineProgress({ status }: { status: LeadView["status"] }) {
  if (CLOSED_STATUSES.includes(status)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
        Closed — {LEAD_STATUS_META[status].label.toLowerCase()}
      </p>
    );
  }
  const current = PIPELINE_STAGES.findIndex((s) => s.statuses.includes(status));
  return (
    <ol className="flex w-full min-w-[30rem] items-center" aria-label="Pipeline progress">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={stage.key} className="flex flex-1 items-center last:flex-none">
            <span className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[10px]",
                  done && "border-primary bg-primary text-primary-foreground",
                  now && "border-primary bg-background ring-4 ring-primary/15",
                  !done && !now && "bg-background text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? (
                  <Check className="size-3" />
                ) : now ? (
                  <span className="size-2 rounded-full bg-primary" />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  now ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
                aria-current={now ? "step" : undefined}
              >
                {now ? LEAD_STATUS_META[status].label : stage.label}
              </span>
            </span>
            {i < PIPELINE_STAGES.length - 1 ? (
              <span
                className={cn("mx-1 mb-5 h-px flex-1", i < current ? "bg-primary" : "bg-border")}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ScoreBreakdown({ lead }: { lead: LeadView }) {
  const score = lead.score;
  if (!score)
    return <p className="text-sm text-muted-foreground">This lead hasn&apos;t been scored yet.</p>;
  const q = score.qualification;
  return (
    <div className="space-y-6">
      <p className="text-sm">{q.reason}</p>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {score.factors
          .filter((f) => f.weight > 0)
          .map((f) => (
            <li key={f.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {f.state === "scored"
                    ? `${f.score}/100`
                    : f.state === "unknown"
                      ? "Unknown"
                      : "n/a"}
                  <span className="ml-1.5 text-muted-foreground/60">· weight {f.weight}</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className={cn(
                    "h-full rounded-full",
                    f.state === "scored"
                      ? (f.score ?? 0) >= 70
                        ? "bg-primary"
                        : (f.score ?? 0) >= 40
                          ? "bg-info"
                          : "bg-warning"
                      : "bg-transparent",
                  )}
                  style={{ width: `${f.score ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{f.reason}</p>
            </li>
          ))}
      </ul>
      {q.met.length + q.failed.length + q.unknown.length > 0 ? (
        <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3">
          {(
            [
              ["Meets", q.met, "bg-success"],
              ["Fails", q.failed, "bg-destructive"],
              ["Unknown", q.unknown, "bg-muted-foreground/40"],
            ] as const
          ).map(([label, items, dot]) => (
            <div key={label}>
              <Eyebrow className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
                {label}
              </Eyebrow>
              <ul className="mt-1.5 space-y-1">
                {items.length === 0 ? (
                  <li className="text-muted-foreground">—</li>
                ) : (
                  items.map((r) => <li key={r}>{r}</li>)
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Scored {formatDate(lead.updatedAt)} with your scoring settings. Unknown data is never
        guessed — add details to raise the score&apos;s confidence.
      </p>
    </div>
  );
}

const TAB_TRIGGER =
  "h-10 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 text-[13px] text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

function Count({ n }: { n: number }) {
  return n > 0 ? (
    <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
      {n}
    </span>
  ) : null;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const [lead, timeline, history, access, research, conversations] = await Promise.all([
    getLead(actor, id),
    listSalesActivity(actor, { leadId: id, limit: 50 }),
    listCopilotHistory(actor, id),
    getProductAccess(actor.companyId, "sales-agent"),
    getLatestResearch(actor, id),
    listConversations(actor, id),
  ]).catch((error: unknown) => {
    // Deleted, mistyped, or in another workspace: a proper 404, not an error page.
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const recommendations = await getLeadRecommendations(actor.companyId, lead);
  const canWrite = can(actor, "sales.write") && access.active;
  const canAi = can(actor, "sales.ai") && access.active;
  const contactable = lead.status !== "DO_NOT_CONTACT";
  const place = [lead.city, lead.country].filter(Boolean).join(", ") || lead.location;
  const company = lead.companyName && lead.companyName !== lead.fullName ? lead.companyName : null;
  const messages = conversations.reduce((n, c) => n + c.messages.length, 0);
  const [nextAction, ...laterActions] = recommendations;
  const score = lead.score;

  return (
    <div className="space-y-5">
      <Link
        href="/sales/leads"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> All leads
      </Link>

      {/* ── Header ── */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-start lg:p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <LeadAvatar name={lead.fullName} size="lg" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight">{lead.fullName}</h1>
                <StatusPill status={lead.status} />
              </div>
              {lead.jobTitle || company ? (
                <p className="text-sm text-muted-foreground">
                  {lead.jobTitle}
                  {lead.jobTitle && company ? " at " : null}
                  {company ? <span className="text-foreground">{company}</span> : null}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {lead.email ? (
                  <ContactChip href={`mailto:${lead.email}`} icon={Mail}>
                    {lead.email}
                  </ContactChip>
                ) : (
                  <ContactChip icon={Mail}>
                    <span className="text-muted-foreground">No email yet</span>
                  </ContactChip>
                )}
                {lead.phone ? (
                  <ContactChip href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} icon={Phone}>
                    {lead.phone}
                  </ContactChip>
                ) : null}
                {lead.website ? (
                  <ContactChip href={lead.website} icon={Globe} external>
                    {lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </ContactChip>
                ) : null}
                {lead.linkedinUrl ? (
                  <ContactChip href={lead.linkedinUrl} icon={Link2} external>
                    LinkedIn
                  </ContactChip>
                ) : null}
                {place ? <ContactChip icon={MapPin}>{place}</ContactChip> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:border-l lg:pl-6">
            <ScoreDial score={lead.leadScore} band={score?.band ?? null} size={64} stroke={5} />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">
                {score ? `${BAND_LABELS[score.band]} lead` : "Not scored"}
              </p>
              {score ? <QualificationBadge status={score.qualification.status} /> : null}
              {score ? (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Data confidence {Math.round(score.confidence * 100)}%
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t px-5 py-4 lg:flex-row lg:items-center lg:px-6">
          <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto pr-3 pb-0.5">
            <PipelineProgress status={lead.status} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canWrite ? (
              <LeadStageButton
                leadId={lead.id}
                status={lead.status}
                allowed={allowedStatusChanges(lead.status)}
              />
            ) : null}
            {canWrite ? (
              <LeadFormDialog
                leadId={lead.id}
                initial={{
                  firstName: lead.firstName ?? "",
                  lastName: lead.lastName ?? "",
                  companyName: lead.companyName ?? "",
                  jobTitle: lead.jobTitle ?? "",
                  email: lead.email ?? "",
                  phone: lead.phone ?? "",
                  website: lead.website ?? "",
                  linkedinUrl: lead.linkedinUrl ?? "",
                  industry: lead.industry ?? "",
                  city: lead.city ?? "",
                  country: lead.country ?? "",
                  companySize: lead.companySize ?? "",
                  notes: lead.notes ?? "",
                  tags: lead.tags.join(", "),
                }}
              />
            ) : null}
            <LeadMenu
              leadId={lead.id}
              leadName={lead.fullName}
              canWrite={canWrite}
              canDelete={can(actor, "sales.delete") && access.active}
            />
          </div>
        </div>
      </section>

      {lead.status === "DO_NOT_CONTACT" ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
          role="status"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            <strong>Do not contact.</strong> This lead opted out. The AI will never recommend or
            send outreach to them.
          </p>
        </div>
      ) : null}

      {/* ── Next best action ── */}
      {nextAction ? (
        <section
          aria-label="Recommended next action"
          className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-5 py-4 sm:flex-row sm:items-center"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow className="text-primary">Next best action</Eyebrow>
            <p className="text-sm">
              <span className="font-semibold">{RECOMMENDATION_LABELS[nextAction.action]}</span>
              <span className="text-muted-foreground"> — {nextAction.reason}</span>
            </p>
          </div>
          {laterActions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 sm:max-w-[45%] sm:justify-end">
              {laterActions.map((r) => (
                <li
                  key={r.action}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                  title={r.reason}
                >
                  <ArrowRight className="size-3" aria-hidden="true" />
                  {RECOMMENDATION_LABELS[r.action]}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ── Work area ── */}
        <Tabs defaultValue="conversations" className="min-w-0 gap-0">
          <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0">
            <TabsTrigger value="conversations" className={TAB_TRIGGER}>
              Conversations <Count n={messages} />
            </TabsTrigger>
            <TabsTrigger value="research" className={TAB_TRIGGER}>
              Research
              {research?.status === "COMPLETED" ? (
                <span className="size-1.5 rounded-full bg-success" aria-label="done" />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="score" className={TAB_TRIGGER}>
              Score breakdown
            </TabsTrigger>
            <TabsTrigger value="timeline" className={TAB_TRIGGER}>
              Timeline <Count n={timeline.length} />
            </TabsTrigger>
          </TabsList>
          <div className="pt-5">
            <TabsContent value="conversations">
              <ConversationsPanel
                leadId={lead.id}
                conversations={conversations}
                canWrite={canWrite}
                canAi={canAi}
                contactable={contactable}
              />
            </TabsContent>
            <TabsContent value="research">
              <ResearchPanel leadId={lead.id} initial={research} canRun={canAi} />
            </TabsContent>
            <TabsContent value="score">
              <ScoreBreakdown lead={lead} />
            </TabsContent>
            <TabsContent value="timeline">
              <ActivityFeed items={timeline} showLead={false} />
            </TabsContent>
          </div>
        </Tabs>

        {/* ── Side column ── */}
        <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl border bg-card p-5">
            <Eyebrow>About</Eyebrow>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              {(
                [
                  ["Industry", lead.industry ?? "—"],
                  ["Company size", lead.companySize ? `${lead.companySize} employees` : "—"],
                  ["Source", LEAD_SOURCE_LABELS[lead.source]],
                  [
                    "Owner",
                    lead.owner ? (
                      <span key="o" className="inline-flex items-center gap-1.5">
                        <LeadAvatar name={lead.owner.name} size="xs" />
                        {lead.owner.name}
                      </span>
                    ) : (
                      "Unassigned"
                    ),
                  ],
                  ["Added", formatDate(lead.createdAt)],
                  [
                    "Last contact",
                    lead.lastContactedAt ? `${formatAgo(lead.lastContactedAt)} ago` : "Never",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate text-right">{value}</dd>
                </div>
              ))}
            </dl>
            {lead.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}
            {lead.notes ? (
              <div className="mt-4 border-t pt-4">
                <Eyebrow>Notes</Eyebrow>
                <p className="mt-1.5 line-clamp-[12] text-[13px] whitespace-pre-line text-foreground/85">
                  {lead.notes}
                </p>
              </div>
            ) : null}
          </section>
          <CopilotPanel leadId={lead.id} initialHistory={history} enabled={canAi} />
        </aside>
      </div>
    </div>
  );
}
