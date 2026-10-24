import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, getSalesAgent } from "@repo/core";
import { PageHeader } from "@/components/common";
import { SetupWizard } from "@/components/sales/setup-wizard";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Set up your AI Sales Agent" };

const ORDER = [
  "company",
  "offering",
  "icp",
  "valueProposition",
  "qualification",
  "tone",
  "goals",
] as const;

export default async function SalesSetupPage() {
  const actor = await requireActor();
  if (!can(actor, "sales.configure")) redirect("/sales");
  const agent = await getSalesAgent(actor);
  if (agent.onboardingCompleted) redirect("/sales/settings");
  // Resume at the first step without content.
  const firstOpen = ORDER.findIndex((s) => !agent.completedSections.includes(s));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Set up your AI Sales Agent"
        description="Tell it about your business the way you'd brief a new sales hire. Plain language is fine — you can change everything later."
      />
      <SetupWizard
        initial={agent.config}
        initialStep={firstOpen === -1 ? ORDER.length - 1 : firstOpen}
      />
    </div>
  );
}
