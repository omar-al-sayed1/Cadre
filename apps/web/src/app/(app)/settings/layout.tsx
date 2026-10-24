import { PageHeader } from "@/components/common";
import { requireActor } from "@/server/auth-context";
import { getSubscribedProducts } from "@/server/products";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const subscribed = await getSubscribedProducts(actor.companyId);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your company workspace." />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <SettingsNav
          products={{
            interviewer: subscribed.has("interviewer"),
            sales: subscribed.has("sales-agent"),
          }}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
