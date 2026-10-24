import type { Metadata } from "next";
import { listProductPlans } from "@repo/core";
import { PageHeader } from "@/components/common";
import { ProductCard, startingPrice } from "@/components/marketplace/product-card";
import { requireActor } from "@/server/auth-context";
import { getWorkspaceProducts } from "@/server/products";

export const metadata: Metadata = { title: "AI Marketplace" };

export default async function MarketplacePage() {
  const actor = await requireActor();
  const products = await getWorkspaceProducts(actor.companyId);
  const prices = Object.fromEntries(
    await Promise.all(
      products
        .filter((p) => p.product.availability === "available")
        .map(
          async (p) =>
            [
              p.product.key,
              startingPrice(
                (await listProductPlans(p.product.key)).map((plan) => plan.priceMonthlyCents),
              ),
            ] as const,
        ),
    ),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Marketplace"
        description="Hire AI employees for your business. Each one is subscribed separately and comes with a free trial."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.product.key}
            product={p.product}
            price={prices[p.product.key] ?? null}
            status={p.status}
            trialDaysLeft={p.trialDaysLeft}
            href={
              p.active && p.product.appPath ? p.product.appPath : `/marketplace/${p.product.key}`
            }
            cta={p.active ? "Open" : p.canStartTrial ? "Explore" : "View plans"}
          />
        ))}
      </div>
    </div>
  );
}
