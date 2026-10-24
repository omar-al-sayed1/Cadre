"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { resetPasswordSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const { errors, formError, validate, setFormError } = useFormErrors();

  if (!token || params.get("error")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
        <p className="text-sm text-muted-foreground">
          This password reset link is invalid or has expired. Request a new one.
        </p>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const data = validate(resetPasswordSchema, form);
    if (!data) return;
    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: data.password, token: token! });
    setLoading(false);
    if (error) {
      setFormError("This reset link is invalid or has expired. Please request a new one.");
      return;
    }
    router.replace("/login?reset=1");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You&apos;ll be signed out of other devices.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field
          label="New password"
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
            autoFocus
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <Input
            {...fieldAria("confirmPassword", errors)}
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
