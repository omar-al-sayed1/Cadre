import { Users } from "lucide-react";
import { can, getJob, listCandidates } from "@repo/core";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidateTable } from "@/components/candidates/candidate-table";
import { EmptyState } from "@/components/common";
import { InviteDialog } from "@/components/invite-dialog";
import { requireActor } from "@/server/auth-context";
import { ImportCsvButton } from "../../../candidates/import-csv-button";

export default async function JobCandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireActor();
  const [job, list] = await Promise.all([
    getJob(actor, id),
    listCandidates(actor, { ...query, jobId: id }),
  ]);
  const published = job.templates
    .filter((t) => t.status === "PUBLISHED")
    .map((t) => ({ id: t.id, name: t.name, durationMinutes: t.durationMinutes }));
  const filtered = Object.keys(query).some((k) => k !== "page" && query[k]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CandidateFilters />
        <div className="flex gap-2">
          {can(actor, "candidate.write") ? <ImportCsvButton jobId={job.id} /> : null}
          {can(actor, "invitation.send") ? <InviteDialog templates={published} /> : null}
        </div>
      </div>
      {list.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No candidates match these filters" : "No candidates yet."}
          description={
            filtered
              ? "Try adjusting or clearing the filters."
              : published.length > 0
                ? "Invite your first candidate to start interviewing."
                : "Publish an interview for this job, then invite your first candidate."
          }
        />
      ) : (
        <CandidateTable
          rows={list.items}
          total={list.total}
          page={list.page}
          pageSize={list.pageSize}
          showJob={false}
          baseQuery={query}
        />
      )}
    </div>
  );
}
