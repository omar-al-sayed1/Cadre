import { SubscriptionBanner } from "@/components/subscription-banner";
import { requireProductPage } from "@/server/products";

/** Every AI Interviewer page requires the workspace to have subscribed to it. */
export default async function InterviewerLayout({ children }: { children: React.ReactNode }) {
  const { access } = await requireProductPage("interviewer");
  return (
    <>
      <SubscriptionBanner access={access} />
      {children}
    </>
  );
}
