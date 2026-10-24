import type { Metadata } from "next";
import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import { compareCandidates } from "@repo/core";
import { db } from "@repo/database";
import type { ConfidenceLevel } from "@repo/shared";
import { cn } from "@repo/ui/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { RecommendationBadge, ScoreBadge, StageBadge } from "@/components/badges";
import { AiDisclaimer, EmptyState, PageHeader } from "@/components/common";
import { requireActor } from "@/server/auth-context";
import { JobPicker } from "./job-picker";

export const metadata: Metadata = { title: "Compare candidates" };

function ConfidenceDots({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  const n = level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : 1;
  return (
    <span
      role="img"
      className="ml-1.5 inline-flex gap-0.5 align-middle"
      title={`${level.toLowerCase()} confidence`}
      aria-label={`${level.toLowerCase()} confidence`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("size-1 rounded-full", i <= n ? "bg-foreground/60" : "bg-border")}
        />
      ))}
    </span>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const jobs = await db.job.findMany({
    where: { companyId: actor.companyId, deletedAt: null },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
  const jobId = params.jobId ?? jobs[0]?.id;
  const data = jobId ? await compareCandidates(actor, jobId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare candidates"
        description="Side-by-side, job-relevant evidence for completed interviews. Dots show confidence."
        actions={jobs.length > 0 ? <JobPicker jobs={jobs} value={jobId} /> : null}
      />
      {!data || data.rows.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Nothing to compare yet"
          description="Candidates appear here once their interviews are completed and evaluated."
        />
      ) : (
        <>
          <div className="rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Candidate</TableHead>
                  <TableHead>Overall</TableHead>
                  {data.skills.map((s) => (
                    <TableHead key={s.key} title={`Weight ${s.weight}%`}>
                      {s.name}
                    </TableHead>
                  ))}
                  <TableHead>Communication</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="pr-5">Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.sessionId}>
                    <TableCell className="pl-5 whitespace-nowrap">
                      <Link
                        href={`/interviews/${row.sessionId}`}
                        className="font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.overridden ? (
                        <div className="text-xs text-muted-foreground">Adjusted by recruiter</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ScoreBadge score={row.overall} />
                      <ConfidenceDots level={row.confidenceLevel} />
                    </TableCell>
                    {data.skills.map((s) => {
                      const cell = row.skills[s.key];
                      return (
                        <TableCell key={s.key} className="whitespace-nowrap">
                          {cell && cell.score !== null ? (
                            <>
                              <span className="font-medium tabular-nums">{cell.score}</span>
                              <ConfidenceDots level={cell.confidenceLevel as ConfidenceLevel} />
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">n/a</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="tabular-nums">{row.communication ?? "—"}</TableCell>
                    <TableCell>
                      <RecommendationBadge value={row.recommendation} />
                    </TableCell>
                    <TableCell className="pr-5">
                      <StageBadge stage={row.stage} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <AiDisclaimer />
        </>
      )}
    </div>
  );
}
