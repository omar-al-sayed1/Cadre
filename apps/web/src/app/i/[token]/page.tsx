import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CircleCheck,
  Clock,
  Headphones,
  Keyboard,
  Mic,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { getInvitationLanding } from "@repo/core";
import { isAppError } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { formatDateTime } from "@/lib/format";
import { hasCandidateCookie } from "@/server/candidate-auth";
import { CandidateChrome } from "./candidate-chrome";

export const metadata: Metadata = {
  title: "Your interview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-16 rounded-2xl border bg-card p-8 text-center shadow-sm">
      <XCircle className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function InvitationLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let landing;
  try {
    landing = await getInvitationLanding(token);
  } catch (error) {
    return (
      <CandidateChrome company={{ name: "Interview", logoUrl: null }}>
        <Problem
          title="This interview link isn't valid"
          body={
            isAppError(error) ? error.message : "Please check the link in your invitation email."
          }
        />
      </CandidateChrome>
    );
  }
  const { state, company, interview, candidate } = landing;
  if (state !== "VALID") {
    const copy = {
      EXPIRED: [
        "This invitation has expired",
        "Please contact the recruiter if you'd still like to interview — they can send you a new link.",
      ],
      CANCELLED: [
        "This invitation was cancelled",
        "Please contact the recruiter if you think this is a mistake.",
      ],
      COMPLETED: [
        "You've already completed this interview",
        "Thank you! Your responses are with the hiring team.",
      ],
      EXHAUSTED: [
        "No interview attempts remain",
        "Please contact the recruiter if you need another attempt.",
      ],
    }[state] as [string, string];
    return (
      <CandidateChrome company={company}>
        <Problem title={copy[0]} body={copy[1]} />
      </CandidateChrome>
    );
  }
  const resume = landing.activeSessionId && (await hasCandidateCookie(landing.activeSessionId));

  return (
    <CandidateChrome company={company}>
      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-primary">AI-assisted interview</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Hi {candidate.firstName}, welcome to your interview for {interview.jobTitle}
          </h1>
          {company.welcomeText ? (
            <p className="mt-3 text-muted-foreground">{company.welcomeText}</p>
          ) : null}
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <Clock className="size-5 text-primary" aria-hidden="true" />
              <div>
                <dt className="text-xs text-muted-foreground">Estimated time</dt>
                <dd className="text-sm font-semibold">{interview.durationMinutes} minutes</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              {interview.responseMode === "TEXT_ONLY" ? (
                <Keyboard className="size-5 text-primary" aria-hidden="true" />
              ) : (
                <Mic className="size-5 text-primary" aria-hidden="true" />
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Format</dt>
                <dd className="text-sm font-semibold">
                  {interview.responseMode === "VOICE_AND_TEXT"
                    ? "Voice or text"
                    : interview.responseMode === "VOICE_ONLY"
                      ? "Voice"
                      : "Text"}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <CalendarClock className="size-5 text-primary" aria-hidden="true" />
              <div>
                <dt className="text-xs text-muted-foreground">Complete before</dt>
                <dd className="text-sm font-semibold">{formatDateTime(interview.expiresAt)}</dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-semibold">How it works</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <Headphones className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {interview.interviewerName}, an AI interviewer, will ask you questions about your
                experience and the role, with follow-ups based on your answers.
              </span>
            </li>
            <li className="flex gap-3">
              <AlarmClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Find a quiet place. You can ask the interviewer to repeat or clarify any question.
              </span>
            </li>
            <li className="flex gap-3">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>If your connection drops, reopen this link — your progress is saved.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Your answers are reviewed by the {company.name} hiring team. The AI supports their
                decision; people make it.
              </span>
            </li>
          </ul>
          {interview.sectionNames.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-medium text-muted-foreground uppercase">Topics</p>
              <p className="mt-1 text-sm">{interview.sectionNames.join(" · ")}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button asChild size="lg">
            <Link href={resume ? `/i/${token}/interview` : `/i/${token}/instructions`}>
              {resume ? "Resume interview" : "Continue"}
            </Link>
          </Button>
        </div>
      </div>
    </CandidateChrome>
  );
}
