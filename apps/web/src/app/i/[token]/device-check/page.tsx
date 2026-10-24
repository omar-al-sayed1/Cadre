import type { Metadata } from "next";
import { CandidateChrome } from "../candidate-chrome";
import { requireCandidateSession } from "../session";
import { DeviceCheck } from "./device-check";

export const metadata: Metadata = {
  title: "Check your microphone",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function DeviceCheckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { landing, view } = await requireCandidateSession(token);
  return (
    <CandidateChrome company={landing.company}>
      <DeviceCheck
        token={token}
        textAllowed={view.responseMode !== "VOICE_ONLY"}
        interviewerName={view.interviewer.name}
        language={view.language}
        voiceHints={view.interviewer.voiceHints}
        ttsMode={view.speech.tts}
        camera={view.camera}
      />
    </CandidateChrome>
  );
}
