"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Rocket,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { INTERVIEW_TYPES, type InterviewType } from "@repo/shared";
import type { TemplateDocument } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { cn } from "@repo/ui/cn";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";
import { DIFFICULTY_LABELS, INTERVIEW_TYPE_LABELS, QUESTION_TYPE_LABELS } from "@/lib/format";
import { QuestionsStep } from "./questions-step";
import { AiSettingsStep, ExperienceStep } from "./settings-steps";
import { StructureStep } from "./structure-step";
import {
  blankDocument,
  reviewIssues,
  withKeys,
  type BuilderDocument,
  type BuilderSkill,
} from "./types";

const STEPS = [
  "Structure",
  "Questions",
  "AI behaviour",
  "Candidate experience",
  "Review & publish",
] as const;

function stripKeys(doc: BuilderDocument): TemplateDocument {
  return {
    ...doc,
    sections: doc.sections.map(({ _key: _s, questions, ...section }) => ({
      ...section,
      questions: questions.map(({ _key: _q, ...q }) => q),
    })),
  };
}

export function GeneratePanel({
  jobId,
  jobTitle,
  onGenerated,
  onBlank,
}: {
  jobId: string;
  jobTitle: string;
  onGenerated: (doc: TemplateDocument) => void;
  onBlank: () => void;
}) {
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState<InterviewType>("MIXED");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" /> Generate interview with
            AI
          </CardTitle>
          <CardDescription>
            Uses the job description, seniority and skill weights for {jobTitle}. You can edit
            everything before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="g-duration">Duration (minutes)</Label>
            <Input
              id="g-duration"
              type="number"
              min={5}
              max={120}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-type">Interview type</Label>
            <Select value={type} onValueChange={(v) => setType(v as InterviewType)}>
              <SelectTrigger id="g-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INTERVIEW_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="g-instructions">Anything to emphasise? (optional)</Label>
            <Textarea
              id="g-instructions"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Focus on practical Spring Boot experience; include one teamwork question."
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              size="lg"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const { document } = await api<{ document: TemplateDocument }>(
                    "/api/interviews/templates/generate",
                    {
                      method: "POST",
                      body: {
                        jobId,
                        durationMinutes: duration,
                        interviewType: type,
                        additionalInstructions: instructions || null,
                      },
                      timeoutMs: 300_000,
                    },
                  );
                  onGenerated(document);
                  toast.success("Interview generated — review and edit before publishing");
                } catch (error) {
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : "Generation failed. Please try again.",
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Sparkles /> {loading ? "Generating…" : "Generate interview"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Start from scratch</CardTitle>
          <CardDescription>
            Build the sections and questions yourself, or add them from your question bank.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onBlank}>
            Start blank
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TemplateBuilder({
  jobId,
  jobTitle,
  skills,
  templateId,
  initial,
  generatedByAi = false,
  publishedVersion = 0,
  hasUnpublishedChanges = true,
}: {
  jobId: string;
  jobTitle: string;
  skills: BuilderSkill[];
  templateId?: string;
  initial?: TemplateDocument;
  generatedByAi?: boolean;
  publishedVersion?: number;
  hasUnpublishedChanges?: boolean;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<BuilderDocument | null>(initial ? withKeys(initial) : null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(!templateId);
  const [fromAi, setFromAi] = useState(generatedByAi);

  if (!doc) {
    return (
      <GeneratePanel
        jobId={jobId}
        jobTitle={jobTitle}
        onGenerated={(generated) => {
          setDoc(withKeys(generated));
          setFromAi(true);
        }}
        onBlank={() => setDoc(blankDocument(jobTitle))}
      />
    );
  }

  const update = (next: BuilderDocument) => {
    setDoc(next);
    setDirty(true);
  };
  const { errors, warnings } = reviewIssues(doc, skills);

  async function save(): Promise<string | null> {
    if (!doc) return null;
    setSaving(true);
    try {
      const body = stripKeys(doc);
      if (templateId) {
        await api(`/api/interviews/templates/${templateId}`, { method: "PUT", body });
        setDirty(false);
        toast.success("Draft saved");
        router.refresh();
        return templateId;
      }
      const { template } = await api<{ template: { id: string } }>("/api/interviews/templates", {
        method: "POST",
        body: { jobId, document: body, generatedByAi: fromAi },
      });
      setDirty(false);
      toast.success("Interview saved");
      router.replace(`/jobs/${jobId}/interview/${template.id}`);
      return template.id;
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? `${error.message}${Object.values(error.fieldErrors)[0] ? ` — ${Object.values(error.fieldErrors)[0]![0]}` : ""}`
          : "Couldn't save the interview.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const id = dirty || !templateId ? await save() : templateId;
      if (!id) return;
      const { version } = await api<{ version: { version: number } }>(
        `/api/interviews/templates/${id}/publish`,
        { method: "POST", body: {} },
      );
      toast.success(`Published version ${version.version}. You can now invite candidates.`);
      router.push(`/jobs/${jobId}?invite=1`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't publish the interview.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="tpl-name">Interview name</Label>
          <Input
            id="tpl-name"
            value={doc.name}
            onChange={(e) => update({ ...doc, name: e.target.value })}
            className="max-w-xl text-base font-medium"
          />
        </div>
        <div className="flex items-center gap-2">
          {publishedVersion > 0 ? (
            <span className="text-xs text-muted-foreground">
              Published v{publishedVersion}
              {hasUnpublishedChanges || dirty ? " · unpublished changes" : ""}
            </span>
          ) : null}
          <Button
            variant="outline"
            onClick={save}
            loading={saving}
            disabled={!dirty && Boolean(templateId)}
          >
            <Save /> {templateId ? "Save draft" : "Save"}
          </Button>
        </div>
      </div>

      <nav aria-label="Builder steps">
        <ol className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  step === i
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs",
                    step === i ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div>
        {step === 0 ? <StructureStep doc={doc} setDoc={update} skills={skills} /> : null}
        {step === 1 ? (
          <QuestionsStep doc={doc} setDoc={update} skills={skills} jobId={jobId} />
        ) : null}
        {step === 2 ? <AiSettingsStep doc={doc} setDoc={update} /> : null}
        {step === 3 ? <ExperienceStep doc={doc} setDoc={update} /> : null}
        {step === 4 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Interview outline</CardTitle>
                <CardDescription>
                  {INTERVIEW_TYPE_LABELS[doc.type]} · {doc.durationMinutes} minutes ·{" "}
                  {doc.minQuestions}–{doc.maxQuestions} questions ·{" "}
                  {DIFFICULTY_LABELS[doc.difficulty === "ADAPTIVE" ? "MEDIUM" : doc.difficulty]}
                  {doc.difficulty === "ADAPTIVE" ? " (adaptive)" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {doc.sections.map((s, i) => (
                    <li key={s._key}>
                      <p className="text-sm font-semibold">
                        {i + 1}. {s.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {s.targetDurationMinutes} min
                        </span>
                      </p>
                      <ul className="mt-1.5 space-y-1 border-l pl-4">
                        {s.questions.map((q) => (
                          <li key={q._key} className="text-sm text-muted-foreground">
                            {q.text || <em>Untitled</em>}{" "}
                            <span className="text-xs">
                              ({QUESTION_TYPE_LABELS[q.type]}
                              {q.mandatory ? ", mandatory" : ""})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ready to publish?</CardTitle>
                <CardDescription>
                  Publishing creates an immutable version. Candidates already interviewing keep
                  their version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {errors.length === 0 && warnings.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-success-foreground">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Everything looks good.
                  </p>
                ) : null}
                {errors.map((e) => (
                  <p key={e} className="flex items-start gap-2 text-sm text-destructive">
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {e}
                  </p>
                ))}
                {warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 text-sm text-warning-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {w}
                  </p>
                ))}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={publish}
                  loading={publishing}
                  disabled={errors.length > 0}
                >
                  <Rocket /> Publish interview
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between border-t pt-4">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)}>
            Next <ArrowRight />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
