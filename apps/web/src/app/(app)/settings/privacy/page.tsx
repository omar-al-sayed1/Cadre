import { can, getCompanySettings } from "@repo/core";
import { requireProductSettings } from "@/server/products";
import { PrivacySettingsForm } from "../settings-forms";

export default async function PrivacySettingsPage() {
  const actor = await requireProductSettings("interviewer");
  return (
    <PrivacySettingsForm
      settings={await getCompanySettings(actor.companyId)}
      canEdit={can(actor, "company.settings")}
    />
  );
}
