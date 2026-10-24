"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@repo/ui/button";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";

/** Starts a product's free trial, then opens the product's setup. */
export function StartTrialButton({
  productKey,
  productName,
  next,
  trialDays,
  size = "default",
  className,
}: {
  productKey: string;
  productName: string;
  next: string;
  trialDays: number;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size={size}
      className={className}
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/api/products/${productKey}/trial`, { method: "POST", body: {} });
          toast.success(`${productName} is ready — your ${trialDays}-day trial has started.`);
          router.push(next);
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Couldn't start the trial. Please try again.",
          );
          setPending(false);
        }
      }}
    >
      <Sparkles /> Start {trialDays}-day free trial
    </Button>
  );
}

export function CancelSubscriptionButton({
  productKey,
  productName,
}: {
  productKey: string;
  productName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={async () => {
        if (
          !window.confirm(
            `Cancel ${productName}? Your data stays available, but it will stop taking on new work.`,
          )
        )
          return;
        setPending(true);
        try {
          await api(`/api/products/${productKey}/cancel`, { method: "POST", body: {} });
          toast.success(`${productName} subscription canceled.`);
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't cancel. Please try again.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      Cancel subscription
    </Button>
  );
}
