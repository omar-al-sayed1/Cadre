"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Separator } from "@repo/ui/misc";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { authClient } from "@/lib/auth-client";
import { withNext } from "@/lib/safe-next";
import { GoogleButton } from "../google-button";

export function LoginForm({
  next,
  googleEnabled,
  notice,
}: {
  /** Where to continue after sign-in (null → home). */
  next: string | null;
  googleEnabled: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { errors, formError, validate, setFormError } = useFormErrors();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const data = validate(loginSchema, { email, password });
    if (!data) return;
    setLoading(true);
    const { error } = await authClient.signIn.email({ email: data.email, password: data.password });
    setLoading(false);
    if (error) {
      setFormError(
        error.status === 403
          ? "Please verify your email address first — check your inbox for the verification link."
          : error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : "Incorrect email or password.",
      );
      return;
    }
    router.replace(next ?? "/home");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your recruiter workspace.</p>
      </div>
      {notice ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-foreground">
          {notice}
        </p>
      ) : null}
      {googleEnabled ? (
        <>
          <GoogleButton callbackURL={next ?? "/home"} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Work email" htmlFor="email" error={errors.email}>
          <Input
            {...fieldAria("email", errors)}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input
            {...fieldAria("password", errors)}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href={withNext("/register", next)}
          className="font-medium text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
