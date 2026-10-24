"use client";

import {
  DIFFICULTY_MODES,
  INTERVIEW_TYPES,
  INTERVIEWER_PERSONALITIES,
  RESPONSE_MODES,
  SUPPORTED_LANGUAGES,
  type DifficultyMode,
  type InterviewType,
  type InterviewerPersonality,
  type ResponseMode,
} from "@repo/shared";
import type { TemplateAiSettings } from "@repo/validation";
import { VOICES } from "@repo/voice/voices";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Slider, Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { humanize, INTERVIEW_TYPE_LABELS } from "@/lib/format";
import type { BuilderDocument } from "./types";

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Row({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const PERSONALITY_HINTS: Record<InterviewerPersonality, string> = {
  PROFESSIONAL: "Courteous, composed and efficient",
  FRIENDLY: "Warm and encouraging, neutral in assessment",
  FORMAL: "Polite and formal",
  CONVERSATIONAL: "Relaxed, like a thoughtful colleague",
};

export function AiSettingsStep({
  doc,
  setDoc,
}: {
  doc: BuilderDocument;
  setDoc: (d: BuilderDocument) => void;
}) {
  const ai = doc.aiSettings;
  const setAi = <K extends keyof TemplateAiSettings>(k: K, v: TemplateAiSettings[K]) =>
    setDoc({ ...doc, aiSettings: { ...ai, [k]: v } });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Row label="Interview type" htmlFor="type">
          <Select
            value={doc.type}
            onValueChange={(v) => setDoc({ ...doc, type: v as InterviewType })}
          >
            <SelectTrigger id="type">
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
        </Row>
        <Row label="Duration (minutes)" htmlFor="duration">
          <Input
            id="duration"
            type="number"
            min={5}
            max={120}
            value={doc.durationMinutes}
            onChange={(e) =>
              setDoc({
                ...doc,
                durationMinutes: Math.min(120, Math.max(5, Number(e.target.value) || 5)),
              })
            }
          />
        </Row>
        <Row label="Questions (min–max)" htmlFor="minq">
          <div className="flex items-center gap-2">
            <Input
              id="minq"
              aria-label="Minimum questions"
              type="number"
              min={1}
              value={doc.minQuestions}
              onChange={(e) =>
                setDoc({ ...doc, minQuestions: Math.max(1, Number(e.target.value) || 1) })
              }
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-label="Maximum questions"
              type="number"
              min={1}
              value={doc.maxQuestions}
              onChange={(e) =>
                setDoc({ ...doc, maxQuestions: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
        </Row>
        <Row
          label="Difficulty"
          htmlFor="difficulty"
          hint={doc.difficulty === "ADAPTIVE" ? "Adjusts to demonstrated ability" : undefined}
        >
          <Select
            value={doc.difficulty}
            onValueChange={(v) => setDoc({ ...doc, difficulty: v as DifficultyMode })}
          >
            <SelectTrigger id="difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTY_MODES.map((d) => (
                <SelectItem key={d} value={d}>
                  {humanize(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Toggle
          id="dynamic"
          label="Dynamic questions"
          description="Let the AI write new questions for under-covered skills, within your structure."
          checked={ai.allowDynamicQuestions}
          onChange={(v) => setAi("allowDynamicQuestions", v)}
        />
        <Toggle
          id="followups"
          label="Follow-up questions"
          description="Probe incomplete answers with targeted follow-ups."
          checked={ai.allowFollowUps}
          onChange={(v) => setAi("allowFollowUps", v)}
        />
        <Toggle
          id="adaptive"
          label="Adaptive difficulty"
          description="Step difficulty up or down based on answers (requires Adaptive difficulty mode)."
          checked={ai.adaptiveDifficulty}
          onChange={(v) => setAi("adaptiveDifficulty", v)}
        />
        <Toggle
          id="resume"
          label="Resume-based questions"
          description="Ask about projects and roles from the candidate's resume."
          checked={ai.resumeQuestions}
          onChange={(v) => setAi("resumeQuestions", v)}
        />
        <Toggle
          id="anything"
          label="“Anything to add?” at the end"
          description="Give the candidate a chance to add context or ask questions."
          checked={ai.askAnythingToAdd}
          onChange={(v) => setAi("askAnythingToAdd", v)}
        />
        <Toggle
          id="strict"
          label="Strict time limit"
          description="End exactly at the time limit instead of allowing a short grace period."
          checked={ai.strictTimeLimit}
          onChange={(v) => setAi("strictTimeLimit", v)}
        />
        <Toggle
          id="reviewers"
          label="Show AI evaluation to reviewers"
          description="Reviewer-role team members can see scores and recommendations."
          checked={ai.showEvaluationToReviewers}
          onChange={(v) => setAi("showEvaluationToReviewers", v)}
        />
      </div>

      {ai.allowFollowUps ? (
        <div className="max-w-md space-y-2 rounded-lg border p-4">
          <Label htmlFor="maxfu">
            Maximum follow-ups per question: {ai.maxFollowUpsPerQuestion}
          </Label>
          <Slider
            id="maxfu"
            aria-label="Maximum follow-ups per question"
            min={0}
            max={4}
            step={1}
            value={[ai.maxFollowUpsPerQuestion]}
            onValueChange={([v]) => setAi("maxFollowUpsPerQuestion", v ?? 0)}
          />
          <p className="text-xs text-muted-foreground">
            Fewer follow-ups are used automatically when time runs short.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ExperienceStep({
  doc,
  setDoc,
}: {
  doc: BuilderDocument;
  setDoc: (d: BuilderDocument) => void;
}) {
  const ai = doc.aiSettings;
  const setAi = <K extends keyof TemplateAiSettings>(k: K, v: TemplateAiSettings[K]) =>
    setDoc({ ...doc, aiSettings: { ...ai, [k]: v } });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Row
          label="Interviewer name"
          htmlFor="iname"
          hint="Leave blank to use your company default."
        >
          <Input
            id="iname"
            value={doc.interviewerName ?? ""}
            maxLength={40}
            onChange={(e) => setDoc({ ...doc, interviewerName: e.target.value || null })}
            placeholder="Ava"
          />
        </Row>
        <Row label="Voice" htmlFor="voice">
          <Select
            value={doc.voice ?? "default"}
            onValueChange={(v) => setDoc({ ...doc, voice: v === "default" ? null : v })}
          >
            <SelectTrigger id="voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Company default</SelectItem>
              {VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label} — {v.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Personality"
          htmlFor="personality"
          hint="Changes tone only — evaluation criteria stay the same."
        >
          <Select
            value={doc.personality}
            onValueChange={(v) => setDoc({ ...doc, personality: v as InterviewerPersonality })}
          >
            <SelectTrigger id="personality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVIEWER_PERSONALITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {humanize(p)} — {PERSONALITY_HINTS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Response mode" htmlFor="mode">
          <Select
            value={doc.responseMode}
            onValueChange={(v) => setDoc({ ...doc, responseMode: v as ResponseMode })}
          >
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESPONSE_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "VOICE_AND_TEXT"
                    ? "Voice and text (recommended)"
                    : m === "VOICE_ONLY"
                      ? "Voice only"
                      : "Text only"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Interview language" htmlFor="lang">
          <Select
            value={doc.language}
            onValueChange={(v) => setDoc({ ...doc, language: v as BuilderDocument["language"] })}
          >
            <SelectTrigger id="lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Toggle
          id="recording"
          label="Record candidate audio"
          description="Requires explicit candidate consent and company-level recording to be enabled."
          checked={ai.recordingEnabled}
          onChange={(v) => setAi("recordingEnabled", v)}
        />
        <Toggle
          id="integrity"
          label="Integrity signals"
          description="Record objective events like tab switches. Never used for scoring or accusations."
          checked={ai.integrityMonitoring}
          onChange={(v) => setAi("integrityMonitoring", v)}
        />
        <Toggle
          id="langswitch"
          label="Allow language switching"
          description="Let candidates request another supported language."
          checked={ai.allowLanguageSwitch}
          onChange={(v) => setAi("allowLanguageSwitch", v)}
        />
      </div>
      {doc.responseMode === "VOICE_ONLY" ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Voice-only interviews exclude candidates without a working microphone. Consider allowing
          text as an accessible alternative.
        </p>
      ) : null}
    </div>
  );
}
