import type { Metadata } from "next";
import { can, getProductAccess, getSalesAgent } from "@repo/core";
import { SalesSettingsEditor } from "@/components/sales/settings-editor";
import { requireProductSettings } from "@/server/products";

export const metadata: Metadata = { title: "Sales playbook" };

export default async function SalesPlaybookSettingsPage() {
  const actor = await requireProductSettings("sales-agent");
  const [agent, access] = await Promise.all([
    getSalesAgent(actor),
    getProductAccess(actor.companyId, "sales-agent"),
  ]);
  return (
    <SalesSettingsEditor
      initial={agent.config}
      canEdit={can(actor, "sales.configure") && access.active}
      sections={["playbook"]}
    />
  );
}
