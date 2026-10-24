"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
  WORK_MODES,
  type EmploymentType,
  type ExperienceLevel,
  type JobStatus,
  type SkillLevel,
  type WorkMode,
} from "@repo/shared";
import { createJobSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Input, Textarea } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { api } from "@/lib/api-client";
import {
  EMPLOYMENT_LABELS,
  EXPERIENCE_LABELS,
  JOB_STATUS_LABELS,
  WORK_MODE_LABELS,
} from "@/lib/format";
import { newSkillRow, SkillsEditor, type SkillRow } from "./skills-editor";

export interface JobFormValues {
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  experienceLevel: ExperienceLevel;
  minExperienceYears: string;
  maxExperienceYears: string;
  description: string;
  responsibilities: string;
  requirements: string;
  preferredQualifications: string;
  status: JobStatus;
  skills: SkillRow[];
}

export const EMPTY_JOB: JobFormValues = {
  title: "",
  department: "",
  location: "",
  employmentType: "FULL_TIME",
  workMode: "REMOTE",
  experienceLevel: "MID",
  minExperienceYears: "",
  maxExperienceYears: "",
  description: "",
  responsibilities: "",
  requirements: "",
  preferredQualifications: "",
  status: "ACTIVE",
  skills: [newSkillRow()],
};

function toPayload(v: JobFormValues) {
  const num = (s: string) => (s.trim() === "" ? null : Number.parseInt(s, 10));
  return {
    title: v.title,
    department: v.department || null,
    location: v.location || null,
    employmentType: v.employmentType,
    workMode: v.workMode,
    experienceLevel: v.experienceLevel,
    minExperienceYears: num(v.minExperienceYears),
    maxExperienceYears: num(v.maxExperienceYears),
    description: v.description,
    responsibilities: v.responsibilities,
    requirements: v.requirements,
    preferredQualifications: v.preferredQualifications,
    status: v.status,
    skills: v.skills
      .filter((s) => s.name.trim() !== "")
      .map((s) => ({
        ...(s.skillId ? { skillId: s.skillId } : { name: s.name.trim() }),
        weight: s.weight,
        expectedLevel: s.expectedLevel as SkillLevel,
        isCritical: s.isCritical,
      })),
  };
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function JobForm({
  initial = EMPTY_JOB,
  jobId,
  onSaved,
  submitLabel,
}: {
  initial?: JobFormValues;
  jobId?: string;
  onSaved?: (jobId: string) => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<JobFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const { errors, formError, validate, handleError } = useFormErrors();
  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = toPayload(values);
    if (!validate(createJobSchema, payload)) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ job: { id: string } }>(
        jobId ? `/api/jobs/${jobId}` : "/api/jobs",
        { method: jobId ? "PATCH" : "POST", body: payload },
      );
      toast.success(jobId ? "Job updated" : "Job created");
      if (onSaved) onSaved(result.job.id);
      else router.push(`/jobs/${result.job.id}`);
      router.refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormError message={formError} />
      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
          <CardDescription>The basics candidates and the AI interviewer will see.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Job title"
            htmlFor="title"
            error={errors.title}
            required
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("title", errors)}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Junior Java Developer"
            />
          </Field>
          <Field label="Department" htmlFor="department" error={errors.department}>
            <Input
              id="department"
              value={values.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="Engineering"
            />
          </Field>
          <Field label="Location" htmlFor="location" error={errors.location}>
            <Input
              id="location"
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Amman, Jordan"
            />
          </Field>
          <SelectField
            id="employmentType"
            label="Employment type"
            value={values.employmentType}
            options={EMPLOYMENT_TYPES}
            labels={EMPLOYMENT_LABELS}
            onChange={(v) => set("employmentType", v)}
          />
          <SelectField
            id="workMode"
            label="Work mode"
            value={values.workMode}
            options={WORK_MODES}
            labels={WORK_MODE_LABELS}
            onChange={(v) => set("workMode", v)}
          />
          <SelectField
            id="experienceLevel"
            label="Experience level"
            value={values.experienceLevel}
            options={EXPERIENCE_LEVELS}
            labels={EXPERIENCE_LABELS}
            onChange={(v) => set("experienceLevel", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Min. years"
              htmlFor="minExperienceYears"
              error={errors.minExperienceYears}
            >
              <Input
                id="minExperienceYears"
                type="number"
                min={0}
                value={values.minExperienceYears}
                onChange={(e) => set("minExperienceYears", e.target.value)}
              />
            </Field>
            <Field
              label="Max. years"
              htmlFor="maxExperienceYears"
              error={errors.maxExperienceYears}
            >
              <Input
                id="maxExperienceYears"
                type="number"
                min={0}
                value={values.maxExperienceYears}
                onChange={(e) => set("maxExperienceYears", e.target.value)}
              />
            </Field>
          </div>
          <SelectField
            id="status"
            label="Status"
            value={values.status}
            options={JOB_STATUSES}
            labels={JOB_STATUS_LABELS}
            onChange={(v) => set("status", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
          <CardDescription>Used by AI to generate relevant interview questions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Summary" htmlFor="description" error={errors.description}>
            <Textarea
              id="description"
              rows={4}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What the role is about and the team the candidate will join."
            />
          </Field>
          <Field label="Responsibilities" htmlFor="responsibilities">
            <Textarea
              id="responsibilities"
              rows={3}
              value={values.responsibilities}
              onChange={(e) => set("responsibilities", e.target.value)}
            />
          </Field>
          <Field label="Requirements" htmlFor="requirements">
            <Textarea
              id="requirements"
              rows={3}
              value={values.requirements}
              onChange={(e) => set("requirements", e.target.value)}
            />
          </Field>
          <Field label="Preferred qualifications" htmlFor="preferredQualifications">
            <Textarea
              id="preferredQualifications"
              rows={2}
              value={values.preferredQualifications}
              onChange={(e) => set("preferredQualifications", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills &amp; weights</CardTitle>
          <CardDescription>
            The rubric the AI evaluates against. Weights must total 100%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkillsEditor
            rows={values.skills}
            onChange={(rows) => set("skills", rows)}
            error={errors.skills?.[0]}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel ?? (jobId ? "Save changes" : "Create job")}
        </Button>
      </div>
    </form>
  );
}
