import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Download, ExternalLink, FileText, Mail, MapPin, Phone } from "lucide-react";
import { can, getCandidate } from "@repo/core";
import { db } from "@repo/database";
import type { ConfidenceLevel, Recommendation } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { ConfidenceBadge, RecommendationBadge, ScoreBadge, StageBadge } from "@/components/badges";
import {
  InvitationActions,
  NotesPanel,
  PrivacyDeletionButton,
  RatingInput,
  ResumeUpload,
  StageSelect,
} from "@/components/candidates/candidate-actions";
import { PageHeader } from "@/components/common";
import { InviteDialog } from "@/components/invite-dialog";
import {
  COMPLETION_REASON_LABELS,
  formatDate,
  formatDateTime,
  fullName,
  humanize,
  SESSION_STATUS_LABELS,
} from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Candidate" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const candidate = await getCandidate(actor, id);
  const [notes, templates] = await Promise.all([
    db.recruiterNote.findMany({
      where: { candidateId: id, companyId: actor.companyId, deletedAt: null },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.interviewTemplate.findMany({
      where: {
        companyId: actor.companyId,
        status: "PUBLISHED",
        deletedAt: null,
        job: { deletedAt: null, status: { notIn: ["CLOSED", "ARCHIVED"] } },
      },
      select: { id: true, name: true, durationMinutes: true, job: { select: { title: true } } },
    }),
  ]);
  const resume = candidate.resumes[0];
  const name = fullName(candidate);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/candidates" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" /> Candidates
          </Link>
        }
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" aria-hidden="true" /> {candidate.email}
            </span>
            {candidate.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden="true" /> {candidate.phone}
              </span>
            ) : null}
            {candidate.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" /> {candidate.location}
              </span>
            ) : null}
            {candidate.linkedinUrl ? (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" /> LinkedIn
              </a>
            ) : null}
          </span>
        }
        actions={
          <>
            {can(actor, "privacy.manage") ? (
              <PrivacyDeletionButton candidateId={candidate.id} />
            ) : null}
            {can(actor, "invitation.send") && templates.length > 0 ? (
              <InviteDialog
                templates={templates.map((t) => ({
                  id: t.id,
                  name: `${t.job.title} — ${t.name}`,
                  durationMinutes: t.durationMinutes,
                }))}
                candidate={{ id: candidate.id, name: candidate.firstName }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {candidate.applications.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Not attached to a job yet. Invite them to an interview to start.
              </CardContent>
            </Card>
          ) : (
            candidate.applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/jobs/${app.job.id}`} className="hover:underline">
                      {app.job.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-3 pt-1">
                    <StageBadge stage={app.stage} />
                    <RatingInput
                      applicationId={app.id}
                      rating={app.manualRating}
                      disabled={!can(actor, "stage.update")}
                    />
                  </CardDescription>
                  {can(actor, "stage.update") ? (
                    <div data-slot="card-action">
                      <StageSelect applicationId={app.id} stage={app.stage} />
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-5">
                  <section aria-labelledby={`interviews-${app.id}`}>
                    <h3 id={`interviews-${app.id}`} className="mb-2 text-sm font-medium">
                      Interviews
                    </h3>
                    {app.sessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No interview started yet.</p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {app.sessions.map((s) => {
                          const evaluation = s.evaluation;
                          return (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div>
                                <Link
                                  href={`/interviews/${s.id}`}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {s.endedAt
                                    ? `Interview on ${formatDate(s.endedAt)}`
                                    : `Started ${formatDateTime(s.startedAt)}`}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {SESSION_STATUS_LABELS[s.status] ?? s.status}
                                  {s.completionReason
                                    ? ` · ${COMPLETION_REASON_LABELS[s.completionReason]}`
                                    : ""}{" "}
                                  · {s.questionsAsked} questions
                                </p>
                              </div>
                              {evaluation?.status === "COMPLETED" ? (
                                <div className="flex items-center gap-3">
                                  <ScoreBadge
                                    score={evaluation.overriddenScore ?? evaluation.overallScore}
                                  />
                                  <RecommendationBadge
                                    value={
                                      (evaluation.overriddenRecommendation ??
                                        evaluation.recommendation) as Recommendation | null
                                    }
                                  />
                                  <ConfidenceBadge
                                    level={evaluation.confidenceLevel as ConfidenceLevel | null}
                                    className="hidden sm:inline-flex"
                                  />
                                </div>
                              ) : evaluation ? (
                                <Badge variant="muted">
                                  {evaluation.status === "FAILED"
                                    ? "Evaluation failed"
                                    : "Evaluating…"}
                                </Badge>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                  <section aria-labelledby={`invitations-${app.id}`}>
                    <h3 id={`invitations-${app.id}`} className="mb-2 text-sm font-medium">
                      Invitations
                    </h3>
                    {app.invitations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No invitations yet.</p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {app.invitations.map((inv) => (
                          <li
                            key={inv.id}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                          >
                            <div>
                              <span className="font-medium">{inv.template.name}</span>
                              <p className="text-xs text-muted-foreground">
                                {humanize(inv.status)} · expires {formatDate(inv.expiresAt)} ·
                                attempts {inv.attemptCount}/{inv.maxAttempts}
                                {inv.lastSentAt ? ` · emailed ${formatDate(inv.lastSentAt)}` : ""}
                              </p>
                            </div>
                            {can(actor, "invitation.send") ? (
                              <InvitationActions invitationId={inv.id} status={inv.status} />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </CardContent>
              </Card>
            ))
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recruiter notes</CardTitle>
              <CardDescription>Private to your team.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotesPanel
                candidateId={candidate.id}
                canWrite={can(actor, "note.write")}
                notes={notes.map((n) => ({
                  id: n.id,
                  content: n.content,
                  createdAt: n.createdAt.toISOString(),
                  author: { name: n.author.name },
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
              <CardDescription>
                PDF or DOCX, up to 10 MB. Used for resume-aware questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {resume ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{resume.originalFilename}</span>
                  </span>
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Download resume">
                    <a href={`/api/resumes/${resume.id}`}>
                      <Download />
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No resume uploaded.</p>
              )}
              {resume ? (
                <p className="text-xs text-muted-foreground">
                  {resume.parseStatus === "COMPLETED"
                    ? "Parsed — the AI interviewer can reference it."
                    : resume.parseStatus === "FAILED"
                      ? `Couldn't parse: ${resume.parseError ?? "unknown error"}`
                      : "Parsing…"}
                </p>
              ) : null}
              {can(actor, "candidate.write") ? <ResumeUpload candidateId={candidate.id} /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{candidate.source ? humanize(candidate.source) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Added</span>
                <span>{formatDate(candidate.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
