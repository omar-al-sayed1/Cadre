import type { Metadata } from "next";
import Link from "next/link";
import { getTeamInvitationByToken } from "@repo/core";
import { ROLE_LABELS } from "@repo/core/permissions";
import { Button } from "@repo/ui/button";
import { BrandLogo } from "@/components/brand";
import { getCurrentUser } from "@/server/auth-context";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getTeamInvitationByToken(token).catch(() => null);
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 p-5">
      <BrandLogo />
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {!invitation ? (
          <>
            <h1 className="text-xl font-semibold">Invitation not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invitation is invalid, already used, or expired. Ask your admin for a new one.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Join {invitation.company.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ve been invited as <strong>{ROLE_LABELS[invitation.role]}</strong> (
              {invitation.email}).
            </p>
            <div className="mt-6">
              {user ? (
                <AcceptInvite token={token} />
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild>
                    <Link href={`/register?next=/invite/${token}`}>Create an account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/login?next=/invite/${token}`}>I already have an account</Link>
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
