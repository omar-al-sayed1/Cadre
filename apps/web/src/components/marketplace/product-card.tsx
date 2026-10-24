import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ProductDefinition } from "@repo/config";
import type { SubscriptionStatus } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { ProductIcon } from "@/components/product-icon";

export function formatPrice(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "Custom pricing";
  if (cents === 0) return "Free";
  return `${new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)}/mo`;
}

/** Lowest public monthly price, or "Free plan available". */
export function startingPrice(prices: Array<number | null>): string | null {
  const known = prices.filter((p): p is number => p !== null);
  if (known.length === 0) return prices.length > 0 ? "Custom pricing" : null;
  const min = Math.min(...known);
  return min === 0 ? "Free plan available" : `From ${formatPrice(min)}`;
}

export function SubscriptionStatusBadge({
  status,
  trialDaysLeft,
}: {
  status: SubscriptionStatus | null;
  trialDaysLeft?: number | null;
}) {
  if (status === null) return null;
  const map: Record<
    SubscriptionStatus,
    { label: string; variant: "success" | "info" | "warning" | "muted" }
  > = {
    ACTIVE: { label: "Active", variant: "success" },
    TRIALING: {
      label:
        trialDaysLeft !== null && trialDaysLeft !== undefined
          ? `Trial · ${trialDaysLeft} days left`
          : "Trial",
      variant: "info",
    },
    PAST_DUE: { label: "Payment due", variant: "warning" },
    CANCELED: { label: "Canceled", variant: "muted" },
    EXPIRED: { label: "Trial ended", variant: "muted" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ProductCard({
  product,
  price,
  status = null,
  trialDaysLeft = null,
  href,
  cta,
  className,
}: {
  product: ProductDefinition;
  price?: string | null;
  status?: SubscriptionStatus | null;
  trialDaysLeft?: number | null;
  href: string | null;
  cta: string;
  className?: string;
}) {
  const comingSoon = product.availability === "coming_soon";
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-6 shadow-xs transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ProductIcon name={product.icon} />
        {comingSoon ? (
          <Badge variant="muted">Coming soon</Badge>
        ) : (
          <SubscriptionStatusBadge status={status} trialDaysLeft={trialDaysLeft} />
        )}
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{product.name}</h3>
      <p className="text-sm font-medium text-primary">{product.tagline}</p>
      <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {product.capabilities.slice(0, 4).map((c) => (
          <li key={c} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <span className="text-sm text-muted-foreground">
          {comingSoon ? "Join the waitlist soon" : (price ?? "")}
        </span>
        {href && !comingSoon ? (
          <Button
            asChild
            variant={status === "ACTIVE" || status === "TRIALING" ? "outline" : "default"}
            size="sm"
          >
            <Link href={href}>
              {cta} <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
