import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerEnv } from "@repo/config/env";
import { getTeamInvitationByToken } from "@repo/core";
import { googleEnabled } from "@/lib/auth";
import { inviteTokenFrom, safeNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/server/auth-context";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next ?? "/home");
  // Coming from a team invitation: say so, and pre-fill the invited address
  // (looked up server-side from the token, never passed in the URL).
  const token = inviteTokenFrom(next);
  const invitation = token ? await getTeamInvitationByToken(token).catch(() => null) : null;
  return (
    <RegisterForm
      next={next}
      invite={invitation ? { companyName: invitation.company.name, email: invitation.email } : null}
      googleEnabled={googleEnabled}
      requiresVerification={getServerEnv().AUTH_REQUIRE_EMAIL_VERIFICATION}
    />
  );
}
