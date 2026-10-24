/**
 * Subscription plan defaults. Plans are also persisted in the `plan` table so
 * limits can be tuned without a deploy; these values seed that table and act as
 * the fallback when a company has no plan assigned.
 */
export interface PlanDefinition {
  key: string;
  name: string;
  monthlyInterviewLimit: number | null; // null = unlimited
  monthlyAiBudgetUsd: number | null;
  seats: number | null;
  priceMonthlyCents: number;
}

export const PLANS: Record<"starter" | "professional" | "enterprise", PlanDefinition> = {
  starter: {
    key: "starter",
    name: "Starter",
    monthlyInterviewLimit: 100,
    monthlyAiBudgetUsd: 150,
    seats: 5,
    priceMonthlyCents: 0,
  },
  professional: {
    key: "professional",
    name: "Professional",
    monthlyInterviewLimit: 1000,
    monthlyAiBudgetUsd: 1500,
    seats: 25,
    priceMonthlyCents: 49_900,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    monthlyInterviewLimit: null,
    monthlyAiBudgetUsd: null,
    seats: null,
    priceMonthlyCents: 0,
  },
};

export const DEFAULT_PLAN_KEY = "starter";
