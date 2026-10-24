"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { COMPANY_SIZE_BANDS, createLeadSchema, updateLeadSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/dialog";
import { Input, Textarea } from "@repo/ui/input";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";

export interface LeadFormValues {
  firstName: string;
  lastName: string;
  companyName: string;
  jobTitle: string;
  email: string;
  phone: string;
  website: string;
  linkedinUrl: string;
  industry: string;
  city: string;
  country: string;
  companySize: string;
  notes: string;
  tags: string;
}

const EMPTY: LeadFormValues = {
  firstName: "",
  lastName: "",
  companyName: "",
  jobTitle: "",
  email: "",
  phone: "",
  website: "",
  linkedinUrl: "",
  industry: "",
  city: "",
  country: "",
  companySize: "",
  notes: "",
  tags: "",
};

function toPayload(v: LeadFormValues) {
  return {
    firstName: v.firstName || null,
    lastName: v.lastName || null,
    companyName: v.companyName || null,
    jobTitle: v.jobTitle || null,
    email: v.email || null,
    phone: v.phone || null,
    website: v.website || null,
    linkedinUrl: v.linkedinUrl || null,
    industry: v.industry || null,
    city: v.city || null,
    country: v.country || null,
    companySize: v.companySize || null,
    notes: v.notes || null,
    tags: v.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Add a lead, or edit one when `leadId` + `initial` are given. */
export function LeadFormDialog({
  leadId,
  initial,
  trigger,
}: {
  leadId?: string;
  initial?: Partial<LeadFormValues>;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const editing = Boolean(leadId);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<LeadFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; reason: string } | null>(
    null,
  );
  const { errors, formError, validate, handleError, clear } = useFormErrors();
  const set = (key: keyof LeadFormValues, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setValues({ ...EMPTY, ...initial });
      setDuplicate(null);
      clear();
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = toPayload(values);
    if (!validate(editing ? updateLeadSchema : createLeadSchema, payload)) return;
    setSaving(true);
    setDuplicate(null);
    try {
      const { lead } = await api<{ lead: { id: string; fullName: string } }>(
        editing ? `/api/sales/leads/${leadId}` : "/api/sales/leads",
        {
          method: editing ? "PATCH" : "POST",
          body: payload,
        },
      );
      toast.success(editing ? "Lead updated" : `${lead.fullName} added and scored`);
      setOpen(false);
      if (editing) router.refresh();
      else router.push(`/sales/leads/${lead.id}`);
    } catch (error) {
      const dup =
        error instanceof ApiError
          ? (error.details.duplicateOf as { id: string; name: string } | undefined)
          : undefined;
      if (dup && error instanceof ApiError) {
        setDuplicate({ ...dup, reason: String(error.details.reason ?? "") });
      } else {
        handleError(error);
      }
    } finally {
      setSaving(false);
    }
  }

  const input = (
    key: keyof LeadFormValues,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field label={label} htmlFor={`lead-${key}`} error={errors[key]}>
      <Input
        {...fieldAria(`lead-${key}`, errors, key)}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        {...props}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            {editing ? <Pencil /> : <Plus />} {editing ? "Edit" : "Add lead"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit lead" : "Add a lead"}</DialogTitle>
          <DialogDescription>
            Only add details you know are accurate — the AI uses them for scoring and
            personalisation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormError message={formError} />
          {duplicate ? (
            <div
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning-foreground"
              role="alert"
            >
              This lead already exists ({duplicate.reason.toLowerCase()}):{" "}
              <Link
                href={`/sales/leads/${duplicate.id}`}
                className="font-medium text-foreground underline"
                onClick={() => setOpen(false)}
              >
                {duplicate.name}
              </Link>
              . Duplicates aren&apos;t created.
            </div>
          ) : null}
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Contact</legend>
            {input("firstName", "First name", { autoComplete: "off" })}
            {input("lastName", "Last name", { autoComplete: "off" })}
            {input("jobTitle", "Job title", { placeholder: "e.g. CEO" })}
            {input("email", "Email", { type: "email", autoComplete: "off" })}
            {input("phone", "Phone", { type: "tel" })}
            {input("linkedinUrl", "LinkedIn URL", { placeholder: "linkedin.com/in/…" })}
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Company</legend>
            {input("companyName", "Company")}
            {input("website", "Website", { placeholder: "example.com" })}
            {input("industry", "Industry", { placeholder: "e.g. Real estate" })}
            <Field
              label="Company size"
              htmlFor="lead-companySize"
              error={errors.companySize}
              hint={`Employees, e.g. 25 or ${COMPANY_SIZE_BANDS[1]}`}
            >
              <Input
                id="lead-companySize"
                value={values.companySize}
                onChange={(e) => set("companySize", e.target.value)}
              />
            </Field>
            {input("city", "City")}
            {input("country", "Country")}
          </fieldset>
          <Field label="Tags" htmlFor="lead-tags" hint="Comma-separated">
            <Input
              id="lead-tags"
              value={values.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="lead-notes" error={errors.notes}>
            <Textarea
              id="lead-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
