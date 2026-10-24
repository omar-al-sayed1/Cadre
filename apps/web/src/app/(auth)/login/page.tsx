import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/server/auth-context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; verified?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next ?? "/home");
  return (
    <LoginForm
      next={next}
      googleEnabled={googleEnabled}
      notice={
        params.reset
          ? "Your password was reset. Sign in with your new password."
          : params.verified
            ? "Email verified. You can sign in now."
            : null
      }
    />
  );
}
