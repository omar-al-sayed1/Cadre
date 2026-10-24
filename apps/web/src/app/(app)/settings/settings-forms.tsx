"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@repo/shared";
import type { CompanySettings } from "@repo/validation";
import { RETENTION_OPTIONS } from "@repo/validation";
import { VOICES } from "@repo/voice/voices";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Slider, Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, useFormErrors } from "@/components/forms";
import { api } from "@/lib/api-client";

function useSave(url: string, method: "PATCH" | "POST" = "PATCH") {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const errors = useFormErrors();
  const save = async (body: unknown) => {
    setSaving(true);
    errors.clear();
    try {
      await api(url, { method, body });
      toast.success("Settings saved");
      router.refresh();
    } catch (error) {
      errors.handleError(error);
    } finally {
      setSaving(false);
    }
  };
  return { saving, save, ...errors };
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export interface CompanyGeneral {
  name: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  timezone: string;
  primaryColor: string | null;
  welcomeText: string | null;
  logoUrl: string | null;
}

export function CompanyForm({ company, canEdit }: { company: CompanyGeneral; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...company,
    website: company.website ?? "",
    industry: company.industry ?? "",
    country: company.country ?? "",
    primaryColor: company.primaryColor ?? "#4F46E5",
    welcomeText: company.welcomeText ?? "",
  });
  const { saving, save, errors, formError } = useSave("/api/companies/current");
  const logoInput = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <Field label="Company name" htmlFor="s-name" error={errors.name}>
            <Input
              id="s-name"
              value={form.name}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Website" htmlFor="s-web" error={errors.website}>
            <Input
              id="s-web"
              value={form.website}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </Field>
          <Field label="Industry" htmlFor="s-ind">
            <Input
              id="s-ind"
              value={form.industry}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </Field>
          <Field label="Country" htmlFor="s-country">
            <Input
              id="s-country"
              value={form.country}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </Field>
          <Field label="Timezone" htmlFor="s-tz">
            <Input
              id="s-tz"
              value={form.timezone}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Shown to candidates on the interview pages and emails.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <span className="flex size-14 items-center justify-center overflow-hidden rounded-xl border bg-muted text-lg font-semibold">
              {company.logoUrl ? (
                <img src={company.logoUrl} alt="Company logo" className="size-full object-cover" />
              ) : (
                company.name[0]
              )}
            </span>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Choose logo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const body = new FormData();
                body.append("file", file);
                try {
                  await api("/api/companies/current/logo", { method: "POST", body });
                  toast.success("Logo updated");
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Upload failed");
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit}
              onClick={() => logoInput.current?.click()}
            >
              <ImageUp /> Upload logo
            </Button>
            <span className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 2 MB</span>
          </div>
          <Field
            label="Brand colour"
            htmlFor="s-color"
            error={errors.primaryColor}
            hint="Buttons in candidate emails. Keep enough contrast with white text."
          >
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                value={form.primaryColor}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value.toUpperCase() })}
                className="h-9 w-12 cursor-pointer rounded-md border bg-background"
              />
              <Input
                id="s-color"
                value={form.primaryColor}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Candidate welcome text" htmlFor="s-welcome" className="sm:col-span-2">
            <Textarea
              id="s-welcome"
              rows={3}
              value={form.welcomeText}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, welcomeText: e.target.value })}
              placeholder="Thanks for your interest in joining our team!"
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            loading={saving}
            disabled={!canEdit}
            onClick={() =>
              save({
                name: form.name,
                website: form.website || null,
                industry: form.industry || null,
                country: form.country || null,
                timezone: form.timezone,
                primaryColor: form.primaryColor || null,
                welcomeText: form.welcomeText || null,
              })
            }
          >
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

const WEIGHT_LABELS: Record<keyof CompanySettings["categoryWeights"], string> = {
  technical: "Technical skills",
  communication: "Communication",
  problemSolving: "Problem solving",
  experience: "Relevant experience",
  behavioral: "Behavioral",
};

export function InterviewSettingsForm({
  settings,
  canEdit,
}: {
  settings: CompanySettings;
  canEdit: boolean;
}) {
  const [s, setS] = useState(settings);
  const { saving, save, formError } = useSave("/api/companies/current/settings");
  const total = Object.values(s.categoryWeights).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Interview defaults</CardTitle>
          <CardDescription>
            Applied to new interviews; each interview can override them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Default language" htmlFor="d-lang">
            <Select
              value={s.defaultLanguage}
              disabled={!canEdit}
              onValueChange={(v) =>
                setS({ ...s, defaultLanguage: v as CompanySettings["defaultLanguage"] })
              }
            >
              <SelectTrigger id="d-lang">
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
          </Field>
          <Field label="Default duration (minutes)" htmlFor="d-dur">
            <Input
              id="d-dur"
              type="number"
              min={5}
              max={120}
              disabled={!canEdit}
              value={s.defaultDurationMinutes}
              onChange={(e) => setS({ ...s, defaultDurationMinutes: Number(e.target.value) || 30 })}
            />
          </Field>
          <Field label="AI interviewer name" htmlFor="d-name">
            <Input
              id="d-name"
              maxLength={40}
              disabled={!canEdit}
              value={s.interviewerName}
              onChange={(e) => setS({ ...s, interviewerName: e.target.value })}
            />
          </Field>
          <Field label="Interviewer voice" htmlFor="d-voice">
            <Select
              value={s.interviewerVoice}
              disabled={!canEdit}
              onValueChange={(v) => setS({ ...s, interviewerVoice: v })}
            >
              <SelectTrigger id="d-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="d-speed">Speaking speed: {s.voiceSpeed.toFixed(2)}×</Label>
            <Slider
              id="d-speed"
              aria-label="Speaking speed"
              min={0.75}
              max={1.25}
              step={0.05}
              disabled={!canEdit}
              value={[s.voiceSpeed]}
              onValueChange={([v]) => setS({ ...s, voiceSpeed: v ?? 1 })}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scoring weights</CardTitle>
          <CardDescription>
            How much each category contributes to the overall score. Must total 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-5">
          {(Object.keys(WEIGHT_LABELS) as Array<keyof CompanySettings["categoryWeights"]>).map(
            (k) => (
              <Field key={k} label={WEIGHT_LABELS[k]} htmlFor={`w-${k}`}>
                <Input
                  id={`w-${k}`}
                  type="number"
                  min={0}
                  max={100}
                  disabled={!canEdit}
                  value={s.categoryWeights[k]}
                  onChange={(e) =>
                    setS({
                      ...s,
                      categoryWeights: { ...s.categoryWeights, [k]: Number(e.target.value) || 0 },
                    })
                  }
                />
              </Field>
            ),
          )}
          <p
            className={
              total === 100
                ? "text-sm text-muted-foreground sm:col-span-5"
                : "text-sm text-destructive sm:col-span-5"
            }
            aria-live="polite"
          >
            Total: {total}%
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI evaluation visibility</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <ToggleRow
            id="v-reviewers"
            label="Show AI evaluations to reviewers"
            description="Reviewer-role members can see scores and recommendations."
            checked={s.showAiEvaluationToReviewers}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, showAiEvaluationToReviewers: v })}
          />
          <ToggleRow
            id="v-candidates"
            label="Show results to candidates"
            description="Off by default. Candidates never see scores unless enabled."
            checked={s.showScoresToCandidate}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, showScoresToCandidate: v })}
          />
        </CardContent>
        <CardFooter className="flex-col items-end gap-2">
          <FormError message={formError} />
          <Button loading={saving} disabled={!canEdit || total !== 100} onClick={() => save(s)}>
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export function PrivacySettingsForm({
  settings,
  canEdit,
}: {
  settings: CompanySettings;
  canEdit: boolean;
}) {
  const [s, setS] = useState(settings);
  const { saving, save, formError } = useSave("/api/companies/current/settings");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; retention</CardTitle>
        <CardDescription>
          Candidate data is automatically deleted after the retention period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Field label="Retain candidate data for" htmlFor="p-ret">
          <Select
            value={String(s.retentionDays)}
            disabled={!canEdit}
            onValueChange={(v) =>
              setS({ ...s, retentionDays: Number(v) as CompanySettings["retentionDays"] })
            }
          >
            <SelectTrigger id="p-ret" className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="divide-y">
          <ToggleRow
            id="p-rec"
            label="Allow audio recording"
            description="Interviews may record candidate audio when enabled on the interview and consented to by the candidate."
            checked={s.recordingEnabled}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, recordingEnabled: v })}
          />
          <ToggleRow
            id="p-int"
            label="Integrity signals"
            description="Record objective events (tab switches, reconnections). Never used for scoring."
            checked={s.integrityMonitoring}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, integrityMonitoring: v })}
          />
          <ToggleRow
            id="p-cam"
            label="Optional camera preview"
            description="Never used to infer emotion, age, gender or any personal characteristic."
            checked={s.cameraEnabled}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, cameraEnabled: v })}
          />
          <ToggleRow
            id="p-fb"
            label="Candidate experience survey"
            description="Ask candidates for optional feedback after the interview."
            checked={s.candidateFeedbackEnabled}
            disabled={!canEdit}
            onChange={(v) => setS({ ...s, candidateFeedbackEnabled: v })}
          />
        </div>
      </CardContent>
      <CardFooter className="flex-col items-end gap-2">
        <FormError message={formError} />
        <Button loading={saving} disabled={!canEdit} onClick={() => save(s)}>
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}

export function NotificationSettingsForm({
  settings,
  canEdit,
}: {
  settings: CompanySettings;
  canEdit: boolean;
}) {
  const [s, setS] = useState(settings);
  const { saving, save, formError } = useSave("/api/companies/current/settings");
  const n = s.notifications;
  const setN = (k: keyof typeof n, v: boolean) => setS({ ...s, notifications: { ...n, [k]: v } });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <ToggleRow
          id="n-inv"
          label="Candidate invitation emails"
          checked={n.candidateInvitation}
          disabled={!canEdit}
          onChange={(v) => setN("candidateInvitation", v)}
        />
        <ToggleRow
          id="n-rem"
          label="Reminder emails before expiry"
          description={`Sent ${s.reminderHoursBeforeExpiry.join(" and ")} hours before the link expires.`}
          checked={n.candidateReminders}
          disabled={!canEdit}
          onChange={(v) => setN("candidateReminders", v)}
        />
        <ToggleRow
          id="n-comp"
          label="Candidate completion confirmation"
          checked={n.candidateCompletion}
          disabled={!canEdit}
          onChange={(v) => setN("candidateCompletion", v)}
        />
        <ToggleRow
          id="n-rec"
          label="Email recruiters when interviews are completed"
          checked={n.recruiterCompletion}
          disabled={!canEdit}
          onChange={(v) => setN("recruiterCompletion", v)}
        />
      </CardContent>
      <CardFooter className="flex-col items-end gap-2">
        <FormError message={formError} />
        <Button loading={saving} disabled={!canEdit} onClick={() => save(s)}>
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
