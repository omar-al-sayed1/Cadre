"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pause, Play, Save } from "lucide-react";
import {
  formatZodError,
  SALES_SECTION_SCHEMAS,
  type SalesAgentConfig,
  type SalesConfigSection,
} from "@repo/validation";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { toast } from "@repo/ui/sonner";
import { FormError } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";
import {
  BehaviorSection,
  PlaybookSection,
  CompanySection,
  GoalsSection,
  IcpSection,
  OfferingSection,
  QualificationSection,
  ScoringSection,
  ToneSection,
  ValuePropSection,
} from "./config-forms";

const TABS: Array<{ section: SalesConfigSection; label: string; description: string }> = [
  { section: "company", label: "Company", description: "Who your AI sales employee represents." },
  { section: "offering", label: "Offering", description: "What it sells." },
  { section: "icp", label: "Ideal customer", description: "Who it prioritises." },
  {
    section: "valueProposition",
    label: "Value proposition",
    description: "Why customers buy from you.",
  },
  { section: "qualification", label: "Qualification", description: "What makes a good lead." },
  { section: "tone", label: "Tone", description: "How it sounds." },
  { section: "goals", label: "Goals", description: "Monthly targets shown on the dashboard." },
  {
    section: "scoring",
    label: "Lead scoring",
    description: "How lead scores are calculated. Saving rescores every lead.",
  },
  { section: "behavior", label: "AI behaviour", description: "Autonomy, language and escalation." },
  {
    section: "playbook",
    label: "Playbook",
    description:
      "How your company sells: policies, forbidden claims, escalation rules and objection handling.",
  },
];

export function SalesSettingsEditor({
  initial,
  canEdit,
  sections,
}: {
  initial: SalesAgentConfig;
  canEdit: boolean;
  /** Restrict to these sections (e.g. the dedicated Playbook page). */
  sections?: SalesConfigSection[];
}) {
  const tabs = sections ? TABS.filter((t) => sections.includes(t.section)) : TABS;
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState<SalesConfigSection | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<{ section: SalesConfigSection; message: string } | null>(null);

  async function save(section: SalesConfigSection) {
    const parsed = SALES_SECTION_SCHEMAS[section].safeParse(config[section]);
    if (!parsed.success) {
      setErrors(formatZodError(parsed.error));
      setError({
        section,
        message: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.",
      });
      return;
    }
    setSaving(section);
    setError(null);
    setErrors({});
    try {
      await api("/api/sales/settings", { method: "PUT", body: { section, data: parsed.data } });
      toast.success(
        section === "scoring" || section === "icp" || section === "qualification"
          ? "Saved — leads are being rescored."
          : "Saved",
      );
      router.refresh();
    } catch (err) {
      setError({ section, message: err instanceof ApiError ? err.message : "Couldn't save." });
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSaving(null);
    }
  }

  const set =
    <K extends SalesConfigSection>(section: K) =>
    (value: SalesAgentConfig[K]) =>
      setConfig((c) => ({ ...c, [section]: value }));

  return (
    <Tabs defaultValue={tabs[0]?.section ?? "company"} className="gap-6">
      <TabsList
        className={cn(
          "scrollbar-none flex h-auto w-full flex-wrap justify-start",
          tabs.length === 1 && "sr-only",
        )}
      >
        {tabs.map((t) => (
          <TabsTrigger key={t.section} value={t.section}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.section} value={t.section}>
          <section className="rounded-2xl border bg-card p-6 shadow-xs" aria-label={t.label}>
            <p className="mb-5 text-sm text-muted-foreground">{t.description}</p>
            {error?.section === t.section ? (
              <div className="mb-4">
                <FormError message={error.message} />
              </div>
            ) : null}
            <fieldset disabled={!canEdit} className="min-w-0">
              {t.section === "company" ? (
                <CompanySection value={config.company} onChange={set("company")} errors={errors} />
              ) : null}
              {t.section === "offering" ? (
                <OfferingSection
                  value={config.offering}
                  onChange={set("offering")}
                  errors={errors}
                />
              ) : null}
              {t.section === "icp" ? (
                <IcpSection value={config.icp} onChange={set("icp")} errors={errors} />
              ) : null}
              {t.section === "valueProposition" ? (
                <ValuePropSection
                  value={config.valueProposition}
                  onChange={set("valueProposition")}
                  errors={errors}
                />
              ) : null}
              {t.section === "qualification" ? (
                <QualificationSection
                  value={config.qualification}
                  onChange={set("qualification")}
                  errors={errors}
                />
              ) : null}
              {t.section === "tone" ? (
                <ToneSection value={config.tone} onChange={set("tone")} errors={errors} />
              ) : null}
              {t.section === "goals" ? (
                <GoalsSection value={config.goals} onChange={set("goals")} errors={errors} />
              ) : null}
              {t.section === "scoring" ? (
                <ScoringSection value={config.scoring} onChange={set("scoring")} errors={errors} />
              ) : null}
              {t.section === "behavior" ? (
                <BehaviorSection
                  value={config.behavior}
                  onChange={set("behavior")}
                  errors={errors}
                />
              ) : null}
              {t.section === "playbook" ? (
                <PlaybookSection
                  value={config.playbook}
                  onChange={set("playbook")}
                  errors={errors}
                />
              ) : null}
            </fieldset>
            {canEdit ? (
              <div className="mt-6 flex justify-end">
                <Button onClick={() => save(t.section)} loading={saving === t.section}>
                  <Save /> Save {t.label.toLowerCase()}
                </Button>
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Only sales managers and admins can change these settings.
              </p>
            )}
          </section>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Pause / resume the agent (spec §100: humans can pause the AI). */
export function AgentStatusToggle({ status }: { status: "SETUP" | "ACTIVE" | "PAUSED" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (status === "SETUP") return null;
  const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api("/api/sales/agent/status", { method: "POST", body: { status: next } });
          toast.success(next === "PAUSED" ? "AI Sales Agent paused" : "AI Sales Agent resumed");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Couldn't update the agent.");
        } finally {
          setPending(false);
        }
      }}
    >
      {status === "ACTIVE" ? <Pause /> : <Play />}{" "}
      {status === "ACTIVE" ? "Pause agent" : "Resume agent"}
    </Button>
  );
}
