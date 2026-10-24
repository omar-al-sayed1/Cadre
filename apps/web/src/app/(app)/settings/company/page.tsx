import { can, getCompany } from "@repo/core";
import { requireActor } from "@/server/auth-context";
import { CompanyForm } from "../settings-forms";

export default async function CompanySettingsPage() {
  const actor = await requireActor();
  const company = await getCompany(actor);
  return (
    <CompanyForm
      canEdit={can(actor, "company.update")}
      company={{
        name: company.name,
        website: company.website,
        industry: company.industry,
        country: company.country,
        timezone: company.timezone,
        primaryColor: company.primaryColor,
        welcomeText: company.welcomeText,
        logoUrl: company.logoKey
          ? `/api/public/companies/${company.id}/logo?v=${company.updatedAt.getTime()}`
          : null,
      }}
    />
  );
}
