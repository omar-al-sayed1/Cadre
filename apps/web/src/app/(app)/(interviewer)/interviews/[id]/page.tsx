import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Clock,
  Download,
  FileText,
  Lightbulb,
  Loader2,
  ShieldQuestion,
} from "lucide-react";
import { getInterviewReport } from "@repo/core";
import type { ConfidenceLevel, IntegrityEventType, Recommendation } from "@repo/shared";
import { CATEGORY_LABELS, scoreBand, type CategoryKey } from "@repo/scoring";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { ConfidenceBadge, RecommendationBadge, ScoreBadge } from "@/components/badges";
import { NotesPanel, StageSelect } from "@/components/candidates/candidate-actions";
import { AiDisclaimer, PageHeader, SkillScoreBar } from "@/components/common";
import {
  AiFeedback,
  AutoRefresh,
  OverrideDialog,
  ReevaluateButton,
  TerminateButton,
  TranscriptViewer,
} from "@/components/report/report-client";
import {
  COMPLETION_REASON_LABELS,
  DIFFICULTY_LABELS,
  formatDateTime,
  formatDuration,
  formatRelative,
  fullName,
  humanize,
  INTEGRITY_LABELS,
  QUESTION_TYPE_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Interview report" };

const ALIGNMENT_LABEL: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "muted" }
> = {
  CONSISTENT: { label: "Consistent", variant: "success" },
  PARTIALLY_SUPPORTED: { label: "Partially supported", variant: "warning" },
  NOT_DEMONSTRATED: { label: "Not demonstrated", variant: "danger" },
  NOT_ASSESSED: { label: "Not assessed", variant: "muted" },
};

export default async function InterviewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const r = await getInterviewReport(actor, id);
  const name = fullName(r.candidate);
  const e = r.evaluation && !("hidden" in r.evaluation) ? r.evaluation : null;
  const evaluating =
    r.session.status === "COMPLETED" &&
    (!r.evaluation || r.evaluation.status === "PENDING" || r.evaluation.status === "PROCESSING");
  const live = !["COMPLETED", "FAILED", "EXPIRED"].includes(r.session.status);
  const categories = e
    ? (Object.entries(e.categoryScores).filter(([k]) => k in CATEGORY_LABELS) as Array<
        [
          CategoryKey,
          { score: number | null; confidence: number; weight: number; effectiveWeight: number },
        ]
      >)
    : [];

  return (
    <div className="space-y-6">
      <AutoRefresh active={evaluating || live} intervalMs={live ? 8_000 : 4_000} />
      <PageHeader
        eyebrow={
          <Link href="/interviews" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" /> Interviews
          </Link>
        }
        title={
          <Link href={`/candidates/${r.candidate.id}`} className="hover:underline">
            {name}
          </Link>
        }
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href={`/jobs/${r.job.id}`} className="hover:text-foreground">
              {r.job.title}
            </Link>
            <span>·</span>
            <span>
              {r.session.endedAt
                ? formatDateTime(r.session.endedAt)
                : r.session.startedAt
                  ? `Started ${formatRelative(r.session.startedAt)}`
                  : "Not started"}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />{" "}
              {formatDuration(r.session.durationSeconds)}
            </span>
          </span>
        }
        actions={
          <>
            {r.permissions.stage ? (
              <StageSelect applicationId={r.application.id} stage={r.application.stage} />
            ) : null}
            {live && r.permissions.terminate ? <TerminateButton sessionId={r.session.id} /> : null}
          </>
        }
      />

      {live ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-5 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Interview {SESSION_STATUS_LABELS[r.session.status]?.toLowerCase() ??
              "in progress"} — {r.session.questionsAsked} questions asked so far. This page updates
            automatically.
          </CardContent>
        </Card>
      ) : null}

      {r.session.status === "COMPLETED" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <Card className="justify-center">
            <CardContent className="space-y-4 text-center">
              {e?.status === "COMPLETED" ? (
                <>
                  <p className="text-sm text-muted-foreground">Overall score</p>
                  <p className="text-6xl font-semibold tracking-tight tabular-nums">
                    {e.effectiveScore ?? "—"}
                    <span className="text-2xl text-muted-foreground"> / 100</span>
                  </p>
                  {e.effectiveScore !== null ? (
                    <p className="text-sm text-muted-foreground">
                      {scoreBand(e.effectiveScore).label}
                    </p>
                  ) : null}
                  <div className="flex flex-col items-center gap-2">
                    <RecommendationBadge value={e.effectiveRecommendation} size="lg" />
                    <ConfidenceBadge level={e.confidenceLevel as ConfidenceLevel | null} />
                  </div>
                  {e.override ? (
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      Overridden by a recruiter (AI: {e.overallScore ?? "—"},{" "}
                      {e.recommendation ? humanize(e.recommendation) : "—"}). Reason:{" "}
                      {e.override.reason}
                    </p>
                  ) : null}
                  {r.permissions.override ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <OverrideDialog
                        sessionId={r.session.id}
                        score={e.effectiveScore}
                        recommendation={e.effectiveRecommendation as Recommendation | null}
                      />
                      <ReevaluateButton sessionId={r.session.id} />
                    </div>
                  ) : null}
                </>
              ) : r.evaluation?.status === "FAILED" ? (
                <div className="space-y-3 py-6">
                  <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden="true" />
                  <p className="text-sm">The evaluation couldn&apos;t be generated.</p>
                  {r.permissions.override ? <ReevaluateButton sessionId={r.session.id} /> : null}
                </div>
              ) : r.evaluation && "hidden" in r.evaluation ? (
                <div className="space-y-2 py-6 text-sm text-muted-foreground">
                  <ShieldQuestion className="mx-auto size-8" aria-hidden="true" />
                  AI evaluation isn&apos;t shown to your role. Review the transcript and evidence
                  directly.
                </div>
              ) : (
                <div className="space-y-3 py-8">
                  <Loader2
                    className="mx-auto size-8 animate-spin text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">Generating the evaluation…</p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Executive summary</CardTitle>
              <CardDescription>
                {r.session.completionReason
                  ? COMPLETION_REASON_LABELS[r.session.completionReason]
                  : ""}{" "}
                · {r.session.questionsAsked} questions, {r.session.followUpsAsked} follow-ups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {e?.summary ? (
                <p className="leading-relaxed">{e.summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The summary appears once the evaluation is ready.
                </p>
              )}
              {categories.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {categories.map(([k, c]) => (
                    <div key={k} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[k]}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{c.score ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Weight {c.weight}%
                        {c.effectiveWeight !== c.weight && c.score !== null
                          ? ` → ${c.effectiveWeight}%`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <AiDisclaimer />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue={e?.status === "COMPLETED" ? "evaluation" : "transcript"}>
        <TabsList className="scrollbar-none flex w-full justify-start overflow-x-auto sm:w-fit">
          {e?.status === "COMPLETED" ? (
            <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
          ) : null}
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="notes">Notes ({r.notes.length})</TabsTrigger>
        </TabsList>

        {e?.status === "COMPLETED" ? (
          <TabsContent value="evaluation" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {e.strengths.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No clear strengths identified.</p>
                  ) : (
                    <ul className="space-y-3">
                      {e.strengths.map((s, i) => (
                        <li
                          key={i}
                          className="rounded-lg border-l-2 border-success bg-success/5 py-2 pr-3 pl-3"
                        >
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground/80">Evidence: </span>
                            {s.evidence}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CircleAlert className="size-4 text-warning" aria-hidden="true" /> Areas of
                    concern
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {e.concerns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No significant concerns identified.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {e.concerns.map((c, i) => (
                        <li
                          key={i}
                          className="rounded-lg border-l-2 border-warning bg-warning/5 py-2 pr-3 pl-3"
                        >
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground/80">Evidence: </span>
                            {c.evidence}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Skill scores</CardTitle>
                <CardDescription>
                  Scored relative to the expected level for this role. Confidence reflects how much
                  evidence was collected.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {e.skills.map((s) => (
                  <div key={s.skillKey} className="space-y-1.5">
                    <SkillScoreBar
                      name={s.skillName}
                      score={s.insufficientEvidence ? null : s.score}
                      weight={s.weight}
                      confidenceLevel={s.insufficientEvidence ? null : s.confidenceLevel}
                      insufficient={s.insufficientEvidence}
                    />
                    <p className="text-xs text-muted-foreground">
                      {s.evidenceCount} answer{s.evidenceCount === 1 ? "" : "s"} · expected{" "}
                      {s.expectedLevel ? humanize(s.expectedLevel) : "—"}
                      {s.evidence[0]?.summary ? ` · ${s.evidence[0].summary}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="size-4 text-primary" aria-hidden="true" /> Suggested
                    follow-up topics
                  </CardTitle>
                  <CardDescription>For the next human interview round.</CardDescription>
                </CardHeader>
                <CardContent>
                  {e.followUpTopics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None suggested.</p>
                  ) : (
                    <ul className="list-disc space-y-1.5 pl-5 text-sm">
                      {e.followUpTopics.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Communication &amp; behaviour</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">
                      Communication{" "}
                      {e.communication.score != null ? (
                        <ScoreBadge score={e.communication.score} className="ml-1" />
                      ) : null}
                    </p>
                    <p className="mt-1 text-muted-foreground">{e.communication.summary ?? "—"}</p>
                  </div>
                  <div>
                    <p className="font-medium">
                      Behavioral{" "}
                      {e.behavioral.score != null ? (
                        <ScoreBadge score={e.behavioral.score} className="ml-1" />
                      ) : null}
                    </p>
                    <p className="mt-1 text-muted-foreground">{e.behavioral.summary ?? "—"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {r.permissions.feedback ? (
              <Card>
                <CardContent>
                  <AiFeedback
                    sessionId={r.session.id}
                    current={
                      e.myFeedback
                        ? { accuracy: e.myFeedback.accuracy, correction: e.myFeedback.correction }
                        : null
                    }
                  />
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent value="questions">
          {r.questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No questions answered yet.
            </p>
          ) : (
            <ol className="space-y-4">
              {r.questions.map((q, i) => (
                <li key={q.threadKey}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="leading-snug">
                        {i + 1}. {q.questionText}
                      </CardTitle>
                      <CardDescription className="flex flex-wrap gap-1.5 pt-1">
                        <Badge variant="muted">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                        <Badge variant="outline">{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                        {q.skillName ? <Badge variant="info">{q.skillName}</Badge> : null}
                        {q.turns.length > 1 ? (
                          <Badge variant="secondary">
                            {q.turns.length - 1} follow-up{q.turns.length > 2 ? "s" : ""}
                          </Badge>
                        ) : null}
                      </CardDescription>
                      <div data-slot="card-action" className="text-right">
                        {q.score !== null ? (
                          <ScoreBadge score={q.score} />
                        ) : q.insufficientEvidence && e ? (
                          <Badge variant="muted">Insufficient evidence</Badge>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {q.turns.map((t) => (
                        <div key={t.answerId} className="space-y-1">
                          {t.isFollowUp ? (
                            <p className="text-xs font-medium text-primary">
                              Follow-up:{" "}
                              <span className="font-normal text-foreground">{t.question}</span>
                            </p>
                          ) : null}
                          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-line">
                            {t.answer || <em className="text-muted-foreground">No answer</em>}
                          </p>
                        </div>
                      ))}
                      {q.assessment ? (
                        <p className="text-sm">
                          <span className="font-medium">Assessment: </span>
                          <span className="text-muted-foreground">{q.assessment}</span>
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="transcript">
          <Card>
            <CardContent>
              <TranscriptViewer
                lines={r.transcript.map((l) => ({
                  id: l.id,
                  role: l.role,
                  content: l.content,
                  offsetSeconds: l.offsetSeconds,
                  recordingId: l.recordingId,
                }))}
                interviewerName={r.session.interviewerName}
                candidateName={name}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resume" className="space-y-4">
          {r.resume ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4" aria-hidden="true" /> {r.resume.filename}
                </CardTitle>
                <div data-slot="card-action">
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/resumes/${r.resume.id}`}>
                      <Download /> Download
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.resume.parsed ? (
                  <>
                    {r.resume.parsed.headline ? (
                      <p className="font-medium">{r.resume.parsed.headline}</p>
                    ) : null}
                    {r.resume.parsed.skills.length > 0 ? (
                      <p>
                        <span className="text-muted-foreground">Skills: </span>
                        {r.resume.parsed.skills.join(", ")}
                      </p>
                    ) : null}
                    {r.resume.parsed.experience.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5">
                        {r.resume.parsed.experience.map((x, i) => (
                          <li key={i}>
                            {x.title}
                            {x.company ? ` — ${x.company}` : ""}
                            {x.startDate ? ` (${x.startDate}–${x.endDate ?? "present"})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Resume parsing: {humanize(r.resume.parseStatus)}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No resume on file.</p>
          )}
          {e?.resumeAlignment.items && e.resumeAlignment.items.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Resume alignment</CardTitle>
                <CardDescription>{e.resumeAlignment.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {e.resumeAlignment.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="text-sm">
                        <p className="font-medium">{item.claim}</p>
                        <p className="text-muted-foreground">{item.interviewEvidence}</p>
                      </div>
                      <Badge variant={ALIGNMENT_LABEL[item.alignment]?.variant ?? "muted"}>
                        {ALIGNMENT_LABEL[item.alignment]?.label ?? item.alignment}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Interview metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {[
                    ["Interview", `${r.session.templateName} (v${r.session.templateVersion})`],
                    ["Planned length", `${r.session.plannedMinutes} min`],
                    ["Actual length", formatDuration(r.session.durationSeconds)],
                    ["Attempt", String(r.session.attemptNumber)],
                    ["Response mode", humanize(r.session.responseMode)],
                    ["Language", r.session.language.toUpperCase()],
                    ["Recording", r.session.recordingEnabled ? "Enabled (consented)" : "Off"],
                    ["Reconnections", String(r.session.reconnectCount)],
                    ...(e
                      ? [
                          ["Prompt version", e.versions.prompt ?? "—"],
                          ["Scoring version", e.versions.scoring ?? "—"],
                          ["Model", `${e.provider ?? "—"} / ${e.model ?? "—"}`],
                        ]
                      : []),
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Integrity signals</CardTitle>
                <CardDescription>
                  Objective browser events for context only. They are not evidence of misconduct and
                  never affect scores.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!r.integrity.enabled ? (
                  <p className="text-sm text-muted-foreground">
                    Integrity monitoring was off for this interview.
                  </p>
                ) : r.integrity.total === 0 ? (
                  <p className="text-sm text-muted-foreground">No integrity signals recorded.</p>
                ) : (
                  <>
                    <p className="mb-3 text-sm">
                      Integrity signals detected: <strong>{r.integrity.total}</strong>
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {(
                        Object.entries(r.integrity.byType) as Array<[IntegrityEventType, number]>
                      ).map(([type, count]) => (
                        <li key={type} className="flex justify-between gap-3">
                          <span>{INTEGRITY_LABELS[type]}</span>
                          <span className="text-muted-foreground tabular-nums">{count}×</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {r.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {r.activity.map((a) => (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-medium">{a.actor?.name ?? "System"}</span>{" "}
                        <span className="text-muted-foreground">
                          {humanize(a.action.split(".").pop() ?? a.action)}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent>
              <NotesPanel
                candidateId={r.candidate.id}
                sessionId={r.session.id}
                applicationId={r.application.id}
                canWrite={r.permissions.note}
                notes={r.notes.map((n) => ({
                  id: n.id,
                  content: n.content,
                  createdAt: n.createdAt.toISOString(),
                  author: { name: n.author.name },
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
