import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { listInterviews } from "@repo/core";
import type { ConfidenceLevel, Recommendation } from "@repo/shared";
import { cn } from "@repo/ui/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { ConfidenceBadge, RecommendationBadge, ScoreBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/common";
import { formatDateTime, fullName, SESSION_STATUS_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Interviews" };

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
] as const;

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const status = (FILTERS.find((f) => f.value === params.status)?.value ?? "ALL") as
    "ALL" | "ACTIVE" | "COMPLETED";
  const { items, total } = await listInterviews(actor, {
    status,
    page: Number(params.page) || 1,
    pageSize: 50,
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Interviews" description="Every AI interview session across your jobs." />
      <nav aria-label="Filter interviews" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "ALL" ? "/interviews" : `/interviews?status=${f.value}`}
            aria-current={status === f.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              status === f.value
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No interviews yet"
          description="Interviews appear here once candidates open their invitation links."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead className="pr-5">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const ev = s.evaluation;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="pl-5">
                      <Link href={`/interviews/${s.id}`} className="font-medium hover:underline">
                        {fullName(s.candidate)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{s.candidate.email}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.application.job.title}
                    </TableCell>
                    <TableCell>{SESSION_STATUS_LABELS[s.status] ?? s.status}</TableCell>
                    <TableCell>
                      <ScoreBadge
                        score={
                          ev?.status === "COMPLETED"
                            ? (ev.overriddenScore ?? ev.overallScore)
                            : null
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {ev?.status === "COMPLETED" ? (
                        <div className="flex flex-col gap-1">
                          <RecommendationBadge
                            value={
                              (ev.overriddenRecommendation ??
                                ev.recommendation) as Recommendation | null
                            }
                          />
                          <ConfidenceBadge level={ev.confidenceLevel as ConfidenceLevel | null} />
                        </div>
                      ) : ev ? (
                        <span className="text-sm text-muted-foreground">
                          {ev.status === "FAILED" ? "Failed" : "Evaluating…"}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {s._count.integrityEvents || "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-sm text-muted-foreground">
                      {formatDateTime(s.endedAt ?? s.startedAt ?? s.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t px-5 py-3 text-sm text-muted-foreground">
            {total} interview{total === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
