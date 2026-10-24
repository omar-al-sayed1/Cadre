import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseTemplateAiSettings } from "@repo/validation";
import { InterviewRoom } from "@/components/interview/interview-room";
import { requireCandidateSession } from "../session";

export const metadata: Metadata = {
  title: "Interview in progress",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { token } = await params;
  const { mode } = await searchParams;
  const { view, loaded } = await requireCandidateSession(token);
  if (view.completed) redirect(`/i/${token}/complete`);
  const settings = parseTemplateAiSettings(loaded.snapshot.aiSettings);
  return (
    <InterviewRoom
      sessionId={view.sessionId}
      token={token}
      initial={view}
      nudgeSeconds={[settings.silenceNudgeSeconds, settings.silenceRepeatSeconds]}
      preferredMode={mode === "text" ? "text" : undefined}
    />
  );
}
