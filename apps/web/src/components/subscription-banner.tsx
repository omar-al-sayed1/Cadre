import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { ProductAccess } from "@repo/core";

/** Trial countdown / lapsed-subscription notice shown at the top of a product. */
export function SubscriptionBanner({ access }: { access: ProductAccess }) {
  const href = `/marketplace/${access.product.key}`;
  if (!access.active) {
    return (
      <div
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        role="status"
      >
        <AlertTriangle className="size-4 text-warning-foreground" aria-hidden="true" />
        <p className="flex-1 text-warning-foreground">
          {access.status === "EXPIRED"
            ? "Your free trial has ended."
            : "This subscription isn't active."}{" "}
          Your data is still available, but {access.product.name} can&apos;t take on new work.
        </p>
        <Link
          href={href}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          View plans
        </Link>
      </div>
    );
  }
  if (access.status === "TRIALING" && access.trialDaysLeft !== null && access.trialDaysLeft <= 7) {
    return (
      <div
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/50 px-4 py-2.5 text-sm"
        role="status"
      >
        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-muted-foreground">
          {access.trialDaysLeft === 0
            ? "Your free trial ends today."
            : `${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"} left in your free trial.`}
        </p>
        <Link href={href} className="font-medium underline-offset-4 hover:underline">
          Choose a plan
        </Link>
      </div>
    );
  }
  return null;
}
