/**
 * Product (AI employee) catalogue. Every product is identified by a stable key;
 * names, copy and icons live here so nothing else hard-codes them. Prices and
 * limits are stored in the `plan` table (seeded from PRODUCT_PLAN_DEFAULTS) so
 * they can change without a deploy.
 */

export const PRODUCT_KEYS = [
  "interviewer",
  "sales-agent",
  "customer-support",
  "phone-agent",
  "email-agent",
] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

/** Icon names map to lucide icons in the web app (config stays UI-library free). */
export type ProductIcon = "user-check" | "trending-up" | "headset" | "phone" | "mail";

export interface ProductDefinition {
  key: ProductKey;
  /** Matches the AgentType enum. */
  agentType: "INTERVIEWER" | "SALES" | "CUSTOMER_SUPPORT" | "PHONE" | "EMAIL";
  name: string;
  /** One line for cards. */
  tagline: string;
  description: string;
  category: "Hiring" | "Sales" | "Support" | "Operations";
  icon: ProductIcon;
  capabilities: string[];
  /** available = can be subscribed to; coming_soon = shown in the marketplace only. */
  availability: "available" | "coming_soon";
  /** In-app home of the product once subscribed. */
  appPath: string | null;
  /** Public marketing page. */
  landingPath: string | null;
  /** Plan used when a company starts a free trial. */
  trialPlanKey: string | null;
}

export const PRODUCTS: Record<ProductKey, ProductDefinition> = {
  interviewer: {
    key: "interviewer",
    agentType: "INTERVIEWER",
    name: "AI Interviewer",
    tagline: "Hire smarter.",
    description:
      "Runs structured first-round interviews by voice or text, asks relevant follow-ups and delivers evidence-based evaluations your hiring team can trust.",
    category: "Hiring",
    icon: "user-check",
    capabilities: [
      "AI-generated interviews from your job description",
      "Natural voice or text interviews with follow-ups",
      "Evidence-based scores and recommendations",
      "Side-by-side candidate comparison",
    ],
    availability: "available",
    appPath: "/dashboard",
    landingPath: "/products/interviewer",
    trialPlanKey: "professional",
  },
  "sales-agent": {
    key: "sales-agent",
    agentType: "SALES",
    name: "AI Sales Agent",
    tagline: "Find and convert more leads.",
    description:
      "Your AI sales employee that finds, qualifies, contacts, and follows up with prospects.",
    category: "Sales",
    icon: "trending-up",
    capabilities: [
      "Learns what you sell and who you sell to",
      "Organises, scores and qualifies your leads",
      "Researches prospects without inventing facts",
      "Recommends the next best action for every lead",
    ],
    availability: "available",
    appPath: "/sales",
    landingPath: "/products/sales-agent",
    trialPlanKey: "sales_pro",
  },
  "customer-support": {
    key: "customer-support",
    agentType: "CUSTOMER_SUPPORT",
    name: "AI Customer Support",
    tagline: "Support customers 24/7.",
    description: "Answers customer questions from your knowledge base and hands off to your team.",
    category: "Support",
    icon: "headset",
    capabilities: ["Knowledge-base answers", "Human hand-off", "Multilingual"],
    availability: "coming_soon",
    appPath: null,
    landingPath: null,
    trialPlanKey: null,
  },
  "phone-agent": {
    key: "phone-agent",
    agentType: "PHONE",
    name: "AI Phone Agent",
    tagline: "Answer every call.",
    description: "Answers and routes calls, takes messages and books appointments.",
    category: "Operations",
    icon: "phone",
    capabilities: ["Call answering", "Appointment booking", "Call summaries"],
    availability: "coming_soon",
    appPath: null,
    landingPath: null,
    trialPlanKey: null,
  },
  "email-agent": {
    key: "email-agent",
    agentType: "EMAIL",
    name: "AI Email Agent",
    tagline: "Inbox zero, on autopilot.",
    description: "Triages your inbox, drafts replies and keeps important threads moving.",
    category: "Operations",
    icon: "mail",
    capabilities: ["Inbox triage", "Draft replies", "Follow-up reminders"],
    availability: "coming_soon",
    appPath: null,
    landingPath: null,
    trialPlanKey: null,
  },
};

export function isProductKey(value: string): value is ProductKey {
  return (PRODUCT_KEYS as readonly string[]).includes(value);
}

export function listProducts(): ProductDefinition[] {
  return PRODUCT_KEYS.map((key) => PRODUCTS[key]);
}

/** Usage-limit keys understood by the entitlement service. `null` = unlimited. */
export interface ProductLimits {
  /** AI Interviewer */
  interviewsPerMonth?: number | null;
  /** AI Sales Agent */
  leadsPerMonth?: number | null;
  aiOperationsPerMonth?: number | null;
  mailboxes?: number | null;
  seats?: number | null;
}

export interface ProductPlanDefault {
  key: string;
  productKey: ProductKey;
  name: string;
  description: string;
  priceMonthlyCents: number | null; // null = custom pricing
  trialDays: number;
  sortOrder: number;
  limits: ProductLimits;
  features: string[];
}

/**
 * Seed values for the `plan` table. Edit plans in the database (admin panel)
 * in production; these only create missing rows.
 */
export const PRODUCT_PLAN_DEFAULTS: ProductPlanDefault[] = [
  {
    key: "sales_starter",
    productKey: "sales-agent",
    name: "Starter",
    description: "For founders and small teams starting outbound.",
    priceMonthlyCents: 4_900,
    trialDays: 14,
    sortOrder: 1,
    limits: { leadsPerMonth: 500, aiOperationsPerMonth: 2_000, mailboxes: 1, seats: 1 },
    features: [
      "500 leads / month",
      "1 mailbox",
      "1 user",
      "Basic analytics",
      "AI-assisted outreach",
    ],
  },
  {
    key: "sales_pro",
    productKey: "sales-agent",
    name: "Pro",
    description: "For growing sales teams that want automation.",
    priceMonthlyCents: 19_900,
    trialDays: 14,
    sortOrder: 2,
    limits: { leadsPerMonth: 5_000, aiOperationsPerMonth: 20_000, mailboxes: 5, seats: 10 },
    features: [
      "5,000 leads / month",
      "5 mailboxes",
      "10 users",
      "Advanced automation",
      "CRM integrations",
      "Advanced analytics",
    ],
  },
  {
    key: "sales_enterprise",
    productKey: "sales-agent",
    name: "Enterprise",
    description: "Custom limits, integrations and support.",
    priceMonthlyCents: null,
    trialDays: 14,
    sortOrder: 3,
    limits: { leadsPerMonth: null, aiOperationsPerMonth: null, mailboxes: null, seats: null },
    features: [
      "Custom limits",
      "Unlimited users",
      "Custom AI",
      "Advanced integrations",
      "Dedicated support",
    ],
  },
];
