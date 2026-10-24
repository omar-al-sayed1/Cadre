"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { brand } from "@repo/config";
import { registerSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Separator } from "@repo/ui/misc";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { authClient } from "@/lib/auth-client";
import { withNext } from "@/lib/safe-next";
import { GoogleButton } from "../google-button";

export function RegisterForm({
  next,
  invite,
  googleEnabled,
  requiresVerification,
}: {
  /** Where to continue after sign-up (e.g. the team invitation); defaults to onboarding. */
  next: string | null;
  invite: { companyName: string; email: string } | null;
  googleEnabled: boolean;
  requiresVerification: boolean;
}) {
  const router = useRouter();
  const destination = next ?? "/onboarding";
  const [form, setForm] = useState({ name: "", email: invite?.email ?? "", password: "" });
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { errors, formError, validate, setFormError } = useFormErrors();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const data = validate(registerSchema, form);
    if (!data) return;
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
      callbackURL: destination,
    });
    setLoading(false);
    if (error) {
      setFormError(
        error.status === 422 || error.code === "USER_ALREADY_EXISTS"
          ? "An account with this email already exists."
          : error.status === 429
            ? "Too many attempts. Please try again later."
            : (error.message ?? "We couldn't create your account."),
      );
      return;
    }
    if (requiresVerification) {
      setSentTo(data.email);
      return;
    }
    router.replace(destination);
    router.refresh();
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{sentTo}</span>. Open it to activate your
          account.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href={withNext("/login", next)}>Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {invite ? `Join ${invite.companyName}` : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {invite
            ? `Create your ${brand.productName} account to accept the invitation. You'll go straight back to it.`
            : `Build your AI workforce with ${brand.productName}.`}
        </p>
      </div>
      {googleEnabled ? (
        <>
          <GoogleButton callbackURL={destination} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input
            {...fieldAria("name", errors)}
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email}>
          <Input
            {...fieldAria("email", errors)}
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password}
          hint="At least 10 characters, with a letter and a number."
        >
          <Input
            {...fieldAria("password", errors)}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the{" "}
          <Link href={brand.legal.termsUrl} className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href={brand.legal.privacyUrl} className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
