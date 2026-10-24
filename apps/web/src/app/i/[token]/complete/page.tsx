import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { getCandidateSessionView, getInvitationLanding } from "@repo/core";
import { CandidateChrome } from "../candidate-chrome";
import { candidateSessionFromRequest } from "@/server/candidate-auth";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Interview complete",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const landing = await getInvitationLanding(token).catch(() => null);
  const company = landing?.company ?? { name: "Interview", logoUrl: null };
  // Feedback is only offered to the browser holding this session's credential.
  const loaded = landing?.latestSessionId
    ? await candidateSessionFromRequest(landing.latestSessionId).catch(() => null)
    : null;
  const view = loaded ? await getCandidateSessionView(loaded) : null;
  return (
    <CandidateChrome company={company}>
      <div className="mt-10 space-y-6">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Thank you — your interview is complete
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Your responses have been recorded and will be reviewed by the {company.name} hiring
            team. They&apos;ll be in touch about next steps.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">You can close this window.</p>
        </div>
        {view?.completed && view.feedback.enabled && !view.feedback.submitted ? (
          <FeedbackForm sessionId={view.sessionId} />
        ) : null}
      </div>
    </CandidateChrome>
  );
}
