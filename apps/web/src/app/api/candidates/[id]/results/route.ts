import { getInterviewReport } from "@repo/core";
import { db } from "@repo/database";
import { AppError } from "@repo/shared";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Latest completed interview report for a candidate (spec: GET /api/candidates/:id/results). */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  const session = await db.interviewSession.findFirst({
    where: {
      candidateId: params.id,
      companyId: actor.companyId,
      status: "COMPLETED",
      deletedAt: null,
    },
    orderBy: { endedAt: "desc" },
    select: { id: true },
  });
  if (!session)
    throw new AppError("NOT_FOUND", { message: "This candidate has no completed interviews yet." });
  return { report: await getInterviewReport(actor, session.id) };
});
