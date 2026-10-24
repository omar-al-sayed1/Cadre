import { Headset, Mail, Phone, TrendingUp, UserCheck, type LucideIcon } from "lucide-react";
import type { ProductIcon as ProductIconName } from "@repo/config";
import { cn } from "@repo/ui/cn";

const ICONS: Record<ProductIconName, LucideIcon> = {
  "user-check": UserCheck,
  "trending-up": TrendingUp,
  headset: Headset,
  phone: Phone,
  mail: Mail,
};

export function productIcon(name: ProductIconName): LucideIcon {
  return ICONS[name];
}

/** The product's icon on a soft tile. */
export function ProductIcon({
  name,
  className,
  size = "md",
}: {
  name: ProductIconName;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = ICONS[name];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
        size === "sm" ? "size-8 rounded-lg" : size === "lg" ? "size-14" : "size-11",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5"} />
    </span>
  );
}
