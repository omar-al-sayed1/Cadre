import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CandidateListRow } from "@repo/core";
import type { ConfidenceLevel, Recommendation } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { ConfidenceBadge, RecommendationBadge, ScoreBadge, StageBadge } from "@/components/badges";
import { formatDate } from "@/lib/format";

export function CandidateTable({
  rows,
  total,
  page,
  pageSize,
  showJob = true,
  baseQuery,
}: {
  rows: CandidateListRow[];
  total: number;
  page: number;
  pageSize: number;
  showJob?: boolean;
  baseQuery: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (p: number) => {
    const q = new URLSearchParams(
      Object.entries(baseQuery).filter((e): e is [string, string] => Boolean(e[1])),
    );
    q.set("page", String(p));
    return `?${q.toString()}`;
  };
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Candidate</TableHead>
            {showJob ? <TableHead>Job</TableHead> : null}
            <TableHead>Stage</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Recommendation</TableHead>
            <TableHead className="pr-5">Interviewed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.applicationId}>
              <TableCell className="pl-5">
                <Link
                  href={`/candidates/${row.candidateId}`}
                  className="font-medium hover:underline"
                >
                  {`${row.firstName} ${row.lastName}`.trim()}
                </Link>
                <div className="text-xs text-muted-foreground">{row.email}</div>
              </TableCell>
              {showJob ? (
                <TableCell className="text-muted-foreground">
                  <Link href={`/jobs/${row.jobId}`} className="hover:underline">
                    {row.jobTitle}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell>
                <StageBadge stage={row.stage} />
              </TableCell>
              <TableCell>
                <ScoreBadge score={row.score} />
              </TableCell>
              <TableCell>
                {row.evaluationStatus === "COMPLETED" ? (
                  <div className="flex flex-col gap-1">
                    <RecommendationBadge value={row.recommendation as Recommendation | null} />
                    <ConfidenceBadge level={row.confidenceLevel as ConfidenceLevel | null} />
                  </div>
                ) : row.evaluationStatus === "PENDING" || row.evaluationStatus === "PROCESSING" ? (
                  <span className="text-sm text-muted-foreground">Evaluating…</span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="pr-5 text-muted-foreground">
                {row.sessionId && row.interviewedAt ? (
                  <Link
                    href={`/interviews/${row.sessionId}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {formatDate(row.interviewedAt)}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
        <span>
          {total} candidate{total === 1 ? "" : "s"}
        </span>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={page <= 1}
            >
              <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1}>
                <ChevronLeft />
              </Link>
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button asChild variant="outline" size="icon-sm" aria-label="Next page">
              <Link href={pageHref(Math.min(pages, page + 1))} aria-disabled={page >= pages}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
