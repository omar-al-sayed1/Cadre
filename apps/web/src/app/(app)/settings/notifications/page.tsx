import { can, getCompanySettings } from "@repo/core";
import { requireProductSettings } from "@/server/products";
import { NotificationSettingsForm } from "../settings-forms";

export default async function NotificationSettingsPage() {
  const actor = await requireProductSettings("interviewer");
  return (
    <NotificationSettingsForm
      settings={await getCompanySettings(actor.companyId)}
      canEdit={can(actor, "company.settings")}
    />
  );
}
