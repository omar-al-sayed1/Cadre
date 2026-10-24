"use client";

import { useCallback, useState } from "react";
import type { z } from "zod";
import { AlertCircle } from "lucide-react";
import { Label } from "@repo/ui/label";
import { cn } from "@repo/ui/cn";
import { formatZodError } from "@repo/validation";
import { ApiError } from "@/lib/api-client";

/** Minimal form-state hook: client-side zod validation + server field errors. */
export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const validate = useCallback(
    <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> | null => {
      const result = schema.safeParse(value);
      if (result.success) {
        setErrors({});
        setFormError(null);
        return result.data;
      }
      const fieldErrors = formatZodError(result.error);
      setErrors(fieldErrors);
      setFormError(fieldErrors._form?.[0] ?? null);
      return null;
    },
    [],
  );

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      setErrors(error.fieldErrors);
      setFormError(error.message);
    } else {
      setFormError(error instanceof Error ? error.message : "Something went wrong.");
    }
  }, []);

  const clear = useCallback(() => {
    setErrors({});
    setFormError(null);
  }, []);

  return { errors, formError, validate, handleError, clear, setFormError };
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string[] | string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {message ? (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

/** aria props for an input with possible errors. */
export function fieldAria(id: string, errors: Record<string, string[]>, key = id) {
  const invalid = Boolean(errors[key]?.length);
  return {
    id,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${id}-error` : undefined,
  };
}
