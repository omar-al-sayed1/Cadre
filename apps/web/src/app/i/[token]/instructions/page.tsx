import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getInvitationLanding } from "@repo/core";
import { CandidateChrome } from "../candidate-chrome";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = {
  title: "Before you begin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function InstructionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const landing = await getInvitationLanding(token).catch(() => null);
  if (!landing || landing.state !== "VALID") redirect(`/i/${token}`);
  return (
    <CandidateChrome company={landing.company}>
      <ConsentForm
        token={token}
        candidateName={`${landing.candidate.firstName} ${landing.candidate.lastName}`.trim()}
        emailHint={landing.candidate.emailHint}
        companyName={landing.company.name}
        interviewerName={landing.interview.interviewerName}
        recording={landing.interview.recording}
        camera={landing.interview.camera}
        responseMode={landing.interview.responseMode}
      />
    </CandidateChrome>
  );
}
