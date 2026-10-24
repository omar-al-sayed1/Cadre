"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Rocket } from "lucide-react";
import {
  formatZodError,
  SALES_SECTION_SCHEMAS,
  type SalesAgentConfig,
  type SalesConfigSection,
} from "@repo/validation";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Progress } from "@repo/ui/misc";
import { toast } from "@repo/ui/sonner";
import { FormError } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";
import {
  CompanySection,
  GoalsSection,
  IcpSection,
  OfferingSection,
  QualificationSection,
  ToneSection,
  ValuePropSection,
} from "./config-forms";

type WizardSection = Extract<
  SalesConfigSection,
  "company" | "offering" | "icp" | "valueProposition" | "qualification" | "tone" | "goals"
>;

const STEPS: Array<{ section: WizardSection; title: string; description: string }> = [
  {
    section: "company",
    title: "Your company",
    description: "Who your AI sales employee works for.",
  },
  {
    section: "offering",
    title: "What you sell",
    description: "The product or service it will talk about.",
  },
  {
    section: "icp",
    title: "Ideal customer",
    description: "Who it should look for and prioritise.",
  },
  {
    section: "valueProposition",
    title: "Value proposition",
    description: "Why customers should choose you.",
  },
  {
    section: "qualification",
    title: "Qualification rules",
    description: "What makes a lead worth pursuing.",
  },
  { section: "tone", title: "Sales tone", description: "How it should sound." },
  { section: "goals", title: "Sales goals", description: "What success looks like each month." },
];

/** Required content per step (beyond schema validity) so the agent has something to work with. */
function missing(section: WizardSection, config: SalesAgentConfig): string | null {
  if (section === "company" && (!config.company.name || !config.company.description))
    return "Add your company name and a short description.";
  if (section === "offering" && (!config.offering.name || !config.offering.description))
    return "Describe what you sell.";
  if (
    section === "icp" &&
    config.icp.industries.length + config.icp.countries.length + config.icp.jobTitles.length === 0
  )
    return "Add at least one target industry, country or role.";
  if (section === "valueProposition" && !config.valueProposition.whyBuy)
    return "Tell us why customers should buy from you.";
  if (section === "qualification" && config.qualification.rules.some((r) => !r.label.trim()))
    return "Give every rule a short description.";
  return null;
}

export function SetupWizard({
  initial,
  initialStep = 0,
}: {
  initial: SalesAgentConfig;
  initialStep?: number;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  async function save(advance: boolean) {
    const problem = missing(current.section, config);
    if (problem) {
      setError(problem);
      return;
    }
    const parsed = SALES_SECTION_SCHEMAS[current.section].safeParse(config[current.section]);
    if (!parsed.success) {
      setErrors(formatZodError(parsed.error));
      setError("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      await api("/api/sales/settings", {
        method: "PUT",
        body: { section: current.section, data: parsed.data, completeOnboarding: last },
      });
      if (last) {
        toast.success("Your AI Sales Agent is set up and active.");
        router.push("/sales");
        router.refresh();
      } else if (advance) {
        setStep((s) => s + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setError(err.message);
      } else setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const props = { errors };
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {Math.round((step / STEPS.length) * 100)}% complete
          </span>
        </div>
        <Progress value={(step / STEPS.length) * 100} aria-label="Setup progress" />
      </div>
      <ol className="hidden flex-wrap gap-1.5 md:flex" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s.section}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                i === step
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : i < step
                    ? "hover:bg-muted"
                    : "text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3" aria-hidden="true" /> : null}
              {s.title}
            </button>
          </li>
        ))}
      </ol>
      <section className="rounded-2xl border bg-card p-6 shadow-xs" aria-labelledby="step-title">
        <h2 id="step-title" className="text-lg font-semibold">
          {current.title}
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">{current.description}</p>
        <FormError message={error} />
        <div className={error ? "mt-4" : undefined}>
          {current.section === "company" ? (
            <CompanySection
              value={config.company}
              onChange={(v) => setConfig({ ...config, company: v })}
              {...props}
            />
          ) : null}
          {current.section === "offering" ? (
            <OfferingSection
              value={config.offering}
              onChange={(v) => setConfig({ ...config, offering: v })}
              {...props}
            />
          ) : null}
          {current.section === "icp" ? (
            <IcpSection
              value={config.icp}
              onChange={(v) => setConfig({ ...config, icp: v })}
              {...props}
            />
          ) : null}
          {current.section === "valueProposition" ? (
            <ValuePropSection
              value={config.valueProposition}
              onChange={(v) => setConfig({ ...config, valueProposition: v })}
              {...props}
            />
          ) : null}
          {current.section === "qualification" ? (
            <QualificationSection
              value={config.qualification}
              onChange={(v) => setConfig({ ...config, qualification: v })}
              {...props}
            />
          ) : null}
          {current.section === "tone" ? (
            <ToneSection
              value={config.tone}
              onChange={(v) => setConfig({ ...config, tone: v })}
              {...props}
            />
          ) : null}
          {current.section === "goals" ? (
            <GoalsSection
              value={config.goals}
              onChange={(v) => setConfig({ ...config, goals: v })}
              {...props}
            />
          ) : null}
        </div>
      </section>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
        >
          <ArrowLeft /> Back
        </Button>
        <Button onClick={() => save(true)} loading={saving}>
          {last ? (
            <>
              <Rocket /> Activate AI Sales Agent
            </>
          ) : (
            <>
              Save and continue <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
