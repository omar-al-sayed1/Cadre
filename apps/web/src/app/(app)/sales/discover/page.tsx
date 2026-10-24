import type { Metadata } from "next";
import {
  can,
  getDiscoveryInfo,
  getProductAccess,
  getSalesAgent,
  listDiscoveryRuns,
} from "@repo/core";
import { PageHeader } from "@/components/common";
import { DiscoveryWorkspace } from "@/components/sales/discovery-workspace";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Find leads" };

export default async function FindLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const actor = await requireActor();
  const [{ run }, agent, access, runs] = await Promise.all([
    searchParams,
    getSalesAgent(actor),
    getProductAccess(actor.companyId, "sales-agent"),
    listDiscoveryRuns(actor),
  ]);
  const icp = agent.config.icp;
  const info = getDiscoveryInfo();
  const canWrite = can(actor, "sales.write") && access.active;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Find leads"
        description="Your AI researcher searches open business data and company websites for companies that match your ideal customer profile, and shows where it found every detail. You decide which become leads."
      />
      <DiscoveryWorkspace
        mode={info.mode}
        reasoning={info.reasoning}
        model={info.model}
        webSearch={info.webSearch}
        defaults={{
          industries: icp.industries,
          countries: icp.countries,
          cities: icp.cities,
          companySizes: icp.companySizes,
        }}
        runs={runs}
        initialRunId={run && runs.some((r) => r.id === run) ? run : null}
        canRun={canWrite && can(actor, "sales.ai")}
        canAdd={canWrite}
        autonomous={agent.config.behavior.autonomy === "AUTONOMOUS"}
      />
    </div>
  );
}
