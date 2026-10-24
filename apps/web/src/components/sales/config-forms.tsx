"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  AUTONOMY_MODES,
  COMPANY_SIZE_BANDS,
  PRICING_MODELS,
  QUALIFICATION_STRICTNESS,
  RULE_FIELDS,
  RULE_OPERATORS,
  SALES_LANGUAGES,
  SALES_TONES,
  SCORE_FACTORS,
  type QualificationRule,
  type SalesAgentConfig,
} from "@repo/validation";
import { FACTOR_LABELS } from "@repo/sales-engine";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Checkbox, Slider, Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Field } from "@/components/forms";

type Errors = Record<string, string[]>;

/** Chips input for short lists (industries, cities, job titles…). */
export function ListInput({
  id,
  value,
  onChange,
  placeholder,
  max = 40,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const next = [...value];
    for (const item of items)
      if (!next.some((v) => v.toLowerCase() === item.toLowerCase()) && next.length < max)
        next.push(item);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="rounded-md border bg-background px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
      <ul className="flex flex-wrap gap-1.5" aria-label="Selected values">
        {value.map((item) => (
          <li
            key={item}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        <li className="min-w-32 flex-1">
          <input
            id={id}
            value={draft}
            placeholder={value.length === 0 ? placeholder : "Add more…"}
            onChange={(e) =>
              e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && !draft && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => add(draft)}
            className="w-full bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </li>
      </ul>
    </div>
  );
}

function OptionSelect<T extends string>({
  id,
  value,
  options,
  labels,
  onChange,
  placeholder,
}: {
  id: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const PRICING_LABELS: Record<(typeof PRICING_MODELS)[number], string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly subscription",
  ANNUAL: "Annual subscription",
  USAGE_BASED: "Usage-based",
  PER_PROJECT: "Per project",
  CUSTOM: "Custom / quote",
};
const TONE_LABELS: Record<(typeof SALES_TONES)[number], string> = {
  PROFESSIONAL: "Professional",
  FRIENDLY: "Friendly",
  CONVERSATIONAL: "Conversational",
  PERSUASIVE: "Persuasive",
  CONSULTATIVE: "Consultative",
  TECHNICAL: "Technical",
  CUSTOM: "Custom",
};
const TONE_HINTS: Record<(typeof SALES_TONES)[number], string> = {
  PROFESSIONAL: "Clear, courteous and efficient.",
  FRIENDLY: "Warm and approachable.",
  CONVERSATIONAL: "Relaxed, like a colleague.",
  PERSUASIVE: "Confident about value — never pushy.",
  CONSULTATIVE: "Asks questions, focuses on their problems.",
  TECHNICAL: "Precise, detail-oriented.",
  CUSTOM: "Follow your own instructions below.",
};
const FIELD_LABELS: Record<(typeof RULE_FIELDS)[number], string> = {
  industry: "Industry",
  country: "Country",
  city: "City",
  companySize: "Company size",
  jobTitle: "Job title",
  companyName: "Company name",
  email: "Email",
  phone: "Phone",
  website: "Website",
};
const OPERATOR_LABELS: Record<(typeof RULE_OPERATORS)[number], string> = {
  equals: "is",
  contains: "contains",
  oneOf: "is one of",
  isPresent: "is known",
  minEmployees: "at least (employees)",
};
const AUTONOMY_LABELS: Record<(typeof AUTONOMY_MODES)[number], string> = {
  AUTONOMOUS: "Autonomous — sends approved message types automatically",
  APPROVAL_REQUIRED: "Approval required — prepares, you approve (recommended)",
  ASSISTED: "Assisted — recommends, you send yourself",
};
const LANGUAGE_LABELS: Record<(typeof SALES_LANGUAGES)[number], string> = {
  en: "English",
  ar: "Arabic (العربية)",
  fr: "French (Français)",
};
const STRICTNESS_LABELS: Record<(typeof QUALIFICATION_STRICTNESS)[number], string> = {
  LENIENT: "Lenient (fit ≥ 50)",
  BALANCED: "Balanced (fit ≥ 60)",
  STRICT: "Strict (fit ≥ 75)",
};

export interface SectionProps<K extends keyof SalesAgentConfig> {
  value: SalesAgentConfig[K];
  onChange: (next: SalesAgentConfig[K]) => void;
  errors?: Errors;
}

export function CompanySection({ value, onChange, errors = {} }: SectionProps<"company">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" htmlFor="c-name" error={errors.name} required>
        <Input id="c-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Website" htmlFor="c-website" error={errors.website}>
        <Input
          id="c-website"
          value={value.website}
          placeholder="https://"
          onChange={(e) => set("website", e.target.value)}
        />
      </Field>
      <Field label="Industry" htmlFor="c-industry">
        <Input
          id="c-industry"
          value={value.industry}
          onChange={(e) => set("industry", e.target.value)}
        />
      </Field>
      <Field label="Country" htmlFor="c-country">
        <Input
          id="c-country"
          value={value.country}
          onChange={(e) => set("country", e.target.value)}
        />
      </Field>
      <Field label="Number of employees" htmlFor="c-employees">
        <Input
          id="c-employees"
          value={value.employees}
          placeholder="e.g. 11-50"
          onChange={(e) => set("employees", e.target.value)}
        />
      </Field>
      <Field
        label="What does your company do?"
        htmlFor="c-description"
        className="sm:col-span-2"
        required
        hint="One or two sentences, in your own words."
      >
        <Textarea
          id="c-description"
          rows={3}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function OfferingSection({ value, onChange }: SectionProps<"offering">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Product or service" htmlFor="o-name" required>
        <Input
          id="o-name"
          value={value.name}
          placeholder="e.g. Property websites"
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field
        label="Price range"
        htmlFor="o-price"
        hint="Only what you're happy for the AI to mention."
      >
        <Input
          id="o-price"
          value={value.priceRange}
          placeholder="e.g. $1,500–$6,000"
          onChange={(e) => set("priceRange", e.target.value)}
        />
      </Field>
      <Field label="Description" htmlFor="o-description" className="sm:col-span-2" required>
        <Textarea
          id="o-description"
          rows={3}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="Pricing model" htmlFor="o-model">
        <OptionSelect
          id="o-model"
          value={value.pricingModel}
          options={PRICING_MODELS}
          labels={PRICING_LABELS}
          onChange={(v) => set("pricingModel", v)}
        />
      </Field>
      <div />
      <Field label="Main benefits" htmlFor="o-benefits" className="sm:col-span-2">
        <ListInput
          id="o-benefits"
          value={value.benefits}
          onChange={(v) => set("benefits", v)}
          placeholder="Type a benefit and press Enter"
        />
      </Field>
      <Field label="Key features" htmlFor="o-features">
        <ListInput id="o-features" value={value.features} onChange={(v) => set("features", v)} />
      </Field>
      <Field label="What makes it different" htmlFor="o-diff">
        <ListInput
          id="o-diff"
          value={value.differentiators}
          onChange={(v) => set("differentiators", v)}
        />
      </Field>
    </div>
  );
}

export function IcpSection({ value, onChange }: SectionProps<"icp">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Target industries" htmlFor="i-industries" className="sm:col-span-2">
        <ListInput
          id="i-industries"
          value={value.industries}
          onChange={(v) => set("industries", v)}
          placeholder="e.g. Real Estate"
        />
      </Field>
      <Field label="Target countries" htmlFor="i-countries">
        <ListInput
          id="i-countries"
          value={value.countries}
          onChange={(v) => set("countries", v)}
          placeholder="e.g. Lebanon"
        />
      </Field>
      <Field label="Target cities" htmlFor="i-cities" hint="Leave empty to target whole countries.">
        <ListInput
          id="i-cities"
          value={value.cities}
          onChange={(v) => set("cities", v)}
          placeholder="e.g. Beirut"
        />
      </Field>
      <Field label="Decision makers to reach" htmlFor="i-titles" className="sm:col-span-2">
        <ListInput
          id="i-titles"
          value={value.jobTitles}
          onChange={(v) => set("jobTitles", v)}
          placeholder="e.g. Owner, CEO, Marketing Manager"
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Company size (employees)</legend>
        <div className="flex flex-wrap gap-4">
          {COMPANY_SIZE_BANDS.map((band) => (
            <label key={band} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.companySizes.includes(band)}
                onCheckedChange={(checked) =>
                  set(
                    "companySizes",
                    checked
                      ? [...value.companySizes, band]
                      : value.companySizes.filter((b) => b !== band),
                  )
                }
              />
              {band}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Revenue range" htmlFor="i-revenue">
        <Input
          id="i-revenue"
          value={value.revenueRange}
          onChange={(e) => set("revenueRange", e.target.value)}
        />
      </Field>
      <Field label="Technologies they use" htmlFor="i-tech">
        <ListInput
          id="i-tech"
          value={value.technologies}
          onChange={(v) => set("technologies", v)}
        />
      </Field>
      <Field
        label="Other characteristics"
        htmlFor="i-traits"
        className="sm:col-span-2"
        hint="e.g. Has active listings, no modern website"
      >
        <ListInput
          id="i-traits"
          value={value.characteristics}
          onChange={(v) => set("characteristics", v)}
          max={30}
        />
      </Field>
    </div>
  );
}

export function ValuePropSection({ value, onChange }: SectionProps<"valueProposition">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4">
      <Field label="Why should customers buy from you?" htmlFor="v-why" required>
        <Textarea
          id="v-why"
          rows={2}
          value={value.whyBuy}
          onChange={(e) => set("whyBuy", e.target.value)}
        />
      </Field>
      <Field label="What problem do you solve?" htmlFor="v-problem">
        <Textarea
          id="v-problem"
          rows={2}
          value={value.problemSolved}
          onChange={(e) => set("problemSolved", e.target.value)}
        />
      </Field>
      <Field label="What makes you different?" htmlFor="v-diff">
        <Textarea
          id="v-diff"
          rows={2}
          value={value.difference}
          onChange={(e) => set("difference", e.target.value)}
        />
      </Field>
      <Field
        label="Biggest customer outcomes"
        htmlFor="v-outcomes"
        hint="Only outcomes you can stand behind — the AI never invents results."
      >
        <ListInput
          id="v-outcomes"
          value={value.outcomes}
          onChange={(v) => set("outcomes", v)}
          max={20}
        />
      </Field>
    </div>
  );
}

function newRule(): QualificationRule {
  return {
    id: `r${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    field: "industry",
    operator: "contains",
    value: "",
    required: false,
  };
}

export function QualificationSection({
  value,
  onChange,
  errors = {},
}: SectionProps<"qualification">) {
  const setRule = (index: number, patch: Partial<QualificationRule>) =>
    onChange({
      ...value,
      rules: value.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rules are checked against each lead&apos;s data. A failed <strong>required</strong> rule
        marks the lead as not a fit; missing data is never treated as a pass.
      </p>
      <ul className="space-y-3">
        {value.rules.map((rule, i) => (
          <li key={rule.id} className="rounded-xl border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                aria-label={`Rule ${i + 1} description`}
                placeholder="Describe the rule, e.g. Is a real estate company"
                value={rule.label}
                onChange={(e) => setRule(i, { label: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove rule ${i + 1}`}
                onClick={() => onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={rule.field}
                onValueChange={(v) => setRule(i, { field: v as QualificationRule["field"] })}
              >
                <SelectTrigger className="h-8 w-36" aria-label={`Rule ${i + 1} field`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={rule.operator}
                onValueChange={(v) => setRule(i, { operator: v as QualificationRule["operator"] })}
              >
                <SelectTrigger className="h-8 w-44" aria-label={`Rule ${i + 1} condition`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_OPERATORS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {OPERATOR_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rule.operator !== "isPresent" ? (
                <Input
                  className="h-8 w-56"
                  aria-label={`Rule ${i + 1} value`}
                  placeholder={
                    rule.operator === "oneOf"
                      ? "Comma-separated values"
                      : rule.operator === "minEmployees"
                        ? "e.g. 5"
                        : "Value"
                  }
                  value={rule.value}
                  onChange={(e) => setRule(i, { value: e.target.value })}
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={rule.required}
                  onCheckedChange={(checked) => setRule(i, { required: checked })}
                  aria-label={`Rule ${i + 1} required`}
                />
                Required
              </label>
            </div>
            {errors[`rules.${i}.label`] ? (
              <p className="mt-1 text-xs text-destructive">{errors[`rules.${i}.label`]?.[0]}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...value, rules: [...value.rules, newRule()] })}
        disabled={value.rules.length >= 30}
      >
        <Plus /> Add rule
      </Button>
      <Field
        label="Anything else that makes a good lead?"
        htmlFor="q-notes"
        hint="Free-text guidance for the AI. It's used as context, never applied without evidence."
      >
        <Textarea
          id="q-notes"
          rows={2}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function ToneSection({ value, onChange }: SectionProps<"tone">) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Sales tone" className="grid gap-2 sm:grid-cols-2">
        {SALES_TONES.map((tone) => (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={value.style === tone}
            onClick={() => onChange({ ...value, style: tone })}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              value.style === tone
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-muted/60",
            )}
          >
            <span className="font-medium">{TONE_LABELS[tone]}</span>
            <span className="block text-muted-foreground">{TONE_HINTS[tone]}</span>
          </button>
        ))}
      </div>
      <Field
        label="Custom instructions"
        htmlFor="t-custom"
        hint="e.g. Keep emails under 100 words. Never mention competitors by name."
      >
        <Textarea
          id="t-custom"
          rows={3}
          value={value.customInstructions}
          onChange={(e) => onChange({ ...value, customInstructions: e.target.value })}
        />
      </Field>
    </div>
  );
}

function NumberInput({
  id,
  value,
  onChange,
  step = 1,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
}) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step={step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

export function GoalsSection({ value, onChange }: SectionProps<"goals">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Qualified leads / month" htmlFor="g-leads">
        <NumberInput
          id="g-leads"
          value={value.monthlyLeads}
          onChange={(v) => set("monthlyLeads", v)}
        />
      </Field>
      <Field label="Meetings / month" htmlFor="g-meetings">
        <NumberInput
          id="g-meetings"
          value={value.monthlyMeetings}
          onChange={(v) => set("monthlyMeetings", v)}
        />
      </Field>
      <Field label="New customers / month" htmlFor="g-customers">
        <NumberInput
          id="g-customers"
          value={value.monthlyCustomers}
          onChange={(v) => set("monthlyCustomers", v)}
        />
      </Field>
      <Field label="Revenue goal / month" htmlFor="g-revenue">
        <NumberInput
          id="g-revenue"
          value={value.monthlyRevenue}
          onChange={(v) => set("monthlyRevenue", v)}
          step={100}
        />
      </Field>
      <Field label="Currency" htmlFor="g-currency">
        <Input
          id="g-currency"
          maxLength={3}
          value={value.revenueCurrency}
          onChange={(e) => set("revenueCurrency", e.target.value.toUpperCase())}
        />
      </Field>
      <Field label="Target conversion rate (%)" htmlFor="g-conversion">
        <NumberInput
          id="g-conversion"
          value={value.conversionRate}
          onChange={(v) => set("conversionRate", v)}
          step={0.5}
        />
      </Field>
    </div>
  );
}

export function ScoringSection({ value, onChange }: SectionProps<"scoring">) {
  const total = SCORE_FACTORS.reduce((sum, f) => sum + value.weights[f], 0);
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          How much each factor counts. Weights are relative (they don&apos;t need to total 100).
          Factors without data are left out and lower the score&apos;s confidence.
        </p>
        {SCORE_FACTORS.map((factor) => (
          <div key={factor} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
            <Label htmlFor={`w-${factor}`} className="text-sm">
              {FACTOR_LABELS[factor]}
            </Label>
            <Slider
              id={`w-${factor}`}
              min={0}
              max={100}
              step={5}
              value={[value.weights[factor]]}
              onValueChange={([v]) =>
                onChange({ ...value, weights: { ...value.weights, [factor]: v ?? 0 } })
              }
              aria-label={`${FACTOR_LABELS[factor]} weight`}
            />
            <span className="text-right text-sm text-muted-foreground tabular-nums">
              {total > 0 ? Math.round((value.weights[factor] / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Score bands (minimum score)</legend>
        {(["hot", "high", "medium", "low"] as const).map((band) => (
          <Field key={band} label={band[0]!.toUpperCase() + band.slice(1)} htmlFor={`b-${band}`}>
            <Input
              id={`b-${band}`}
              type="number"
              min={1}
              max={100}
              value={value.bands[band]}
              onChange={(e) =>
                onChange({
                  ...value,
                  bands: { ...value.bands, [band]: Number(e.target.value) || 1 },
                })
              }
            />
          </Field>
        ))}
      </fieldset>
    </div>
  );
}

export function BehaviorSection({ value, onChange }: SectionProps<"behavior">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="Autonomy"
        htmlFor="bh-autonomy"
        className="sm:col-span-2"
        hint="Outbound sending arrives with mailbox integration; this setting will apply to it."
      >
        <OptionSelect
          id="bh-autonomy"
          value={value.autonomy}
          options={AUTONOMY_MODES}
          labels={AUTONOMY_LABELS}
          onChange={(v) => set("autonomy", v)}
        />
      </Field>
      <Field label="Language" htmlFor="bh-language">
        <OptionSelect
          id="bh-language"
          value={value.language}
          options={SALES_LANGUAGES}
          labels={LANGUAGE_LABELS}
          onChange={(v) => set("language", v)}
        />
      </Field>
      <Field label="Qualification strictness" htmlFor="bh-strict">
        <OptionSelect
          id="bh-strict"
          value={value.qualificationStrictness}
          options={QUALIFICATION_STRICTNESS}
          labels={STRICTNESS_LABELS}
          onChange={(v) => set("qualificationStrictness", v)}
        />
      </Field>
      <Field label="Response length" htmlFor="bh-length">
        <OptionSelect
          id="bh-length"
          value={value.responseLength}
          options={["SHORT", "MEDIUM", "DETAILED"] as const}
          labels={{ SHORT: "Short", MEDIUM: "Medium", DETAILED: "Detailed" }}
          onChange={(v) => set("responseLength", v)}
        />
      </Field>
      <Field
        label={`Escalate to a human below ${value.escalationThreshold}% AI confidence`}
        htmlFor="bh-escalation"
      >
        <Slider
          id="bh-escalation"
          min={0}
          max={100}
          step={5}
          value={[value.escalationThreshold]}
          onValueChange={([v]) => set("escalationThreshold", v ?? 60)}
          aria-label="Escalation threshold"
        />
      </Field>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <Switch
          checked={value.matchProspectLanguage}
          onCheckedChange={(c) => set("matchProspectLanguage", c)}
        />
        <span>
          <span className="font-medium">Reply in the prospect&apos;s language</span>
          <span className="block text-muted-foreground">
            When a prospect writes in Arabic or French, answer in that language.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <Switch
          checked={value.discloseAutomation}
          onCheckedChange={(c) => set("discloseAutomation", c)}
        />
        <span>
          <span className="font-medium">Disclose AI assistance</span>
          <span className="block text-muted-foreground">
            Recommended. Some jurisdictions require disclosing automated outreach.
          </span>
        </span>
      </label>
    </div>
  );
}

export function PlaybookSection({ value, onChange }: SectionProps<"playbook">) {
  const set = <F extends keyof typeof value>(k: F, v: (typeof value)[F]) =>
    onChange({ ...value, [k]: v });
  const setObjection = (index: number, patch: Partial<(typeof value.objections)[number]>) =>
    set(
      "objections",
      value.objections.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opening style" htmlFor="p-opening" hint="How first messages should start.">
          <Textarea
            id="p-opening"
            rows={2}
            value={value.openingStyle}
            onChange={(e) => set("openingStyle", e.target.value)}
          />
        </Field>
        <Field
          label="Meeting rules"
          htmlFor="p-meetings"
          hint="e.g. 15-minute calls, weekdays 10:00–16:00 Beirut time."
        >
          <Textarea
            id="p-meetings"
            rows={2}
            value={value.meetingRules}
            onChange={(e) => set("meetingRules", e.target.value)}
          />
        </Field>
        <Field label="Pricing policy" htmlFor="p-pricing" hint="What the AI may say about price.">
          <Textarea
            id="p-pricing"
            rows={2}
            value={value.pricingPolicy}
            onChange={(e) => set("pricingPolicy", e.target.value)}
          />
        </Field>
        <Field
          label="Discount policy"
          htmlFor="p-discount"
          hint="Leave empty to never offer discounts."
        >
          <Textarea
            id="p-discount"
            rows={2}
            value={value.discountPolicy}
            onChange={(e) => set("discountPolicy", e.target.value)}
          />
        </Field>
        <Field label="Competitor positioning" htmlFor="p-competitors">
          <Textarea
            id="p-competitors"
            rows={2}
            value={value.competitorPositioning}
            onChange={(e) => set("competitorPositioning", e.target.value)}
          />
        </Field>
        <Field
          label="Follow-up rules"
          htmlFor="p-followup"
          hint="e.g. At most 3 follow-ups, at least 3 days apart."
        >
          <Textarea
            id="p-followup"
            rows={2}
            value={value.followUpRules}
            onChange={(e) => set("followUpRules", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Qualification questions"
        htmlFor="p-questions"
        hint="Questions to uncover fit during conversations."
      >
        <ListInput
          id="p-questions"
          value={value.qualificationQuestions}
          onChange={(v) => set("qualificationQuestions", v)}
          max={20}
        />
      </Field>
      <Field
        label="Forbidden claims"
        htmlFor="p-forbidden"
        hint="Drafts containing these are flagged for review. e.g. guaranteed results, #1 in Lebanon"
      >
        <ListInput
          id="p-forbidden"
          value={value.forbiddenClaims}
          onChange={(v) => set("forbiddenClaims", v)}
          max={30}
        />
      </Field>
      <Field
        label="Escalate to a person when…"
        htmlFor="p-escalation"
        hint="e.g. a deal is above $10,000, a contract or legal question comes up."
      >
        <ListInput
          id="p-escalation"
          value={value.escalationRules}
          onChange={(v) => set("escalationRules", v)}
          max={20}
        />
      </Field>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Objection handling</legend>
        <p className="text-sm text-muted-foreground">
          How to respond respectfully to common objections. The AI follows these and never uses
          pressure tactics.
        </p>
        <ul className="space-y-3">
          {value.objections.map((o, i) => (
            <li key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[14rem_1fr_auto]">
              <Input
                aria-label={`Objection ${i + 1}`}
                value={o.objection}
                placeholder="e.g. Too expensive"
                onChange={(e) => setObjection(i, { objection: e.target.value })}
              />
              <Textarea
                aria-label={`Response to objection ${i + 1}`}
                rows={2}
                value={o.response}
                onChange={(e) => setObjection(i, { response: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove objection ${i + 1}`}
                onClick={() =>
                  set(
                    "objections",
                    value.objections.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value.objections.length >= 30}
          onClick={() => set("objections", [...value.objections, { objection: "", response: "" }])}
        >
          <Plus /> Add objection
        </Button>
      </fieldset>
    </div>
  );
}
