import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { can, getProductAccess, getSalesAgent } from "@repo/core";
import { Button } from "@repo/ui/button";
import { PageHeader } from "@/components/common";
import { AgentStatusToggle, SalesSettingsEditor } from "@/components/sales/settings-editor";
import { requireActor } from "@/server/auth-context";

export const metadata: Metadata = { title: "AI Sales Agent settings" };

export default async function SalesSettingsPage() {
  const actor = await requireActor();
  const [agent, access] = await Promise.all([
    getSalesAgent(actor),
    getProductAccess(actor.companyId, "sales-agent"),
  ]);
  const canEdit = can(actor, "sales.configure") && access.active;
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Sales Agent settings"
        description="Everything your AI sales employee knows about your business and how it should work."
        actions={
          <div className="flex gap-2">
            {canEdit && !agent.onboardingCompleted ? (
              <Button asChild>
                <Link href="/sales/setup">
                  Guided setup <ArrowRight />
                </Link>
              </Button>
            ) : null}
            {canEdit ? <AgentStatusToggle status={agent.status} /> : null}
          </div>
        }
      />
      <SalesSettingsEditor initial={agent.config} canEdit={canEdit} />
    </div>
  );
}
