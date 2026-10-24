"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { errors, formError, validate, setFormError } = useFormErrors();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const data = validate(forgotPasswordSchema, { email });
    if (!data) return;
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email: data.email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    // Always show the same confirmation to avoid revealing which emails have accounts.
    if (error && error.status === 429) {
      setFormError("Too many requests. Please try again later.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, we sent a link to reset your password. It expires
          in one hour.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            {...fieldAria("email", errors)}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset link
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
