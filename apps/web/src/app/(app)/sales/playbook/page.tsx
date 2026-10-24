import type { Metadata } from "next";
import { can, getProductAccess, getSalesAgent } from "@repo/core";
import { PageHeader } from "@/components/common";
import { SalesSettingsEditor } from "@/components/sales/settings-editor";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "Sales playbook" };

export default async function SalesPlaybookPage() {
  const actor = await requireActor();
  const [agent, access] = await Promise.all([
    getSalesAgent(actor),
    getProductAccess(actor.companyId, "sales-agent"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales playbook"
        description="The rules your AI sales employee follows in every draft, analysis and recommendation."
      />
      <SalesSettingsEditor
        initial={agent.config}
        canEdit={can(actor, "sales.configure") && access.active}
        sections={["playbook"]}
      />
    </div>
  );
}
