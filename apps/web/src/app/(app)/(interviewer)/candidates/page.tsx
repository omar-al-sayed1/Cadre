import type { Metadata } from "next";
import { Users } from "lucide-react";
import { can, listCandidates } from "@repo/core";
import { db } from "@repo/database";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidateTable } from "@/components/candidates/candidate-table";
import { EmptyState, PageHeader } from "@/components/common";
import { requireActor } from "@/server/auth-context";
import { AddCandidateDialog } from "./add-candidate-dialog";
import { ImportCsvButton } from "./import-csv-button";

export const metadata: Metadata = { title: "Candidates" };

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireActor();
  const query = await searchParams;
  const [list, jobs] = await Promise.all([
    listCandidates(actor, query),
    db.job.findMany({
      where: { companyId: actor.companyId, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const filtered = Object.keys(query).some((k) => k !== "page" && query[k]);
  const canWrite = can(actor, "candidate.write");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        description="Everyone in your pipeline, across all jobs."
        actions={
          canWrite ? (
            <>
              <ImportCsvButton />
              <AddCandidateDialog jobs={jobs} />
            </>
          ) : null
        }
      />
      <CandidateFilters jobs={jobs} />
      {list.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No candidates match these filters" : "No candidates yet."}
          description={
            filtered
              ? "Try adjusting or clearing the filters."
              : "Invite your first candidate to start interviewing."
          }
        />
      ) : (
        <CandidateTable
          rows={list.items}
          total={list.total}
          page={list.page}
          pageSize={list.pageSize}
          baseQuery={query}
        />
      )}
    </div>
  );
}
