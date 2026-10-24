import { can, getCompanySettings } from "@repo/core";
import { requireProductSettings } from "@/server/products";
import { InterviewSettingsForm } from "../settings-forms";

export default async function InterviewSettingsPage() {
  const actor = await requireProductSettings("interviewer");
  return (
    <InterviewSettingsForm
      settings={await getCompanySettings(actor.companyId)}
      canEdit={can(actor, "company.settings")}
    />
  );
}
