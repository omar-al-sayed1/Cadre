import { SubscriptionBanner } from "@/components/subscription-banner";
import { requireProductPage } from "@/server/products";

/** Every AI Sales Agent page requires the workspace to have subscribed to it. */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { access } = await requireProductPage("sales-agent");
  return (
    <>
      <SubscriptionBanner access={access} />
      {children}
    </>
  );
}
