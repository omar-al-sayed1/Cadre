import "server-only";
import { redirect } from "next/navigation";
import { getCandidateSessionView, getInvitationLanding } from "@repo/core";
import { candidateSessionFromRequest } from "@/server/candidate-auth";

/** Resolve the candidate's active session for a token, or send them back to the start. */
export async function requireCandidateSession(token: string) {
  const landing = await getInvitationLanding(token).catch(() => null);
  if (!landing) redirect(`/i/${token}`);
  if (!landing.activeSessionId)
    redirect(landing.state === "COMPLETED" ? `/i/${token}/complete` : `/i/${token}`);
  const loaded = await candidateSessionFromRequest(landing.activeSessionId).catch(() => null);
  if (!loaded) redirect(`/i/${token}/instructions`);
  return { landing, loaded, view: await getCandidateSessionView(loaded) };
}
