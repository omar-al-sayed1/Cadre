"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMPANY_SIZES, type CompanySize } from "@repo/shared";
import { createCompanySchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { useClientValue } from "@/hooks/use-latest";
import { api } from "@/lib/api-client";

const SIZE_LABELS: Record<CompanySize, string> = {
  SIZE_1_10: "1–10 employees",
  SIZE_11_50: "11–50 employees",
  SIZE_51_200: "51–200 employees",
  SIZE_201_1000: "201–1,000 employees",
  SIZE_1000_PLUS: "1,000+ employees",
};

export function CompanyForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    website: "",
    industry: "",
    size: "" as CompanySize | "",
    country: "",
    timezone: "",
  });
  const detectedTimezone = useClientValue(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    "UTC",
  );
  const [saving, setSaving] = useState(false);
  const { errors, formError, validate, handleError } = useFormErrors();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      ...form,
      timezone: form.timezone || detectedTimezone,
      size: form.size || null,
      website: form.website || null,
      industry: form.industry || null,
      country: form.country || null,
    };
    const data = validate(createCompanySchema, payload);
    if (!data) return;
    setSaving(true);
    try {
      await api("/api/companies", { method: "POST", body: payload });
      toast.success("Company created");
      router.replace("/onboarding");
      router.refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={formError} />
      </div>
      <Field
        label="Company name"
        htmlFor="name"
        error={errors.name}
        required
        className="sm:col-span-2"
      >
        <Input
          {...fieldAria("name", errors)}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nova Technologies"
          autoFocus
        />
      </Field>
      <Field label="Website" htmlFor="website" error={errors.website}>
        <Input
          {...fieldAria("website", errors)}
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://nova.example"
        />
      </Field>
      <Field label="Industry" htmlFor="industry">
        <Input
          id="industry"
          value={form.industry}
          onChange={(e) => setForm({ ...form, industry: e.target.value })}
          placeholder="Software"
        />
      </Field>
      <Field label="Company size" htmlFor="size">
        <Select
          value={form.size}
          onValueChange={(v) => setForm({ ...form, size: v as CompanySize })}
        >
          <SelectTrigger id="size">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {SIZE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Country" htmlFor="country">
        <Input
          id="country"
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
          placeholder="Jordan"
        />
      </Field>
      <Field label="Timezone" htmlFor="timezone" hint="Used for invitation deadlines.">
        <Input
          id="timezone"
          value={form.timezone || detectedTimezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        />
      </Field>
      <div className="flex items-end justify-end sm:col-span-2">
        <Button type="submit" loading={saving}>
          Create company
        </Button>
      </div>
    </form>
  );
}
