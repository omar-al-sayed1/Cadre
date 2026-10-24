/* eslint-disable no-console -- CLI output for a manual smoke test */
/**
 * Manual smoke test for the prospecting agent against the live open-data
 * sources (no database, no AI key — keyword-rules mode).
 *
 *   pnpm --filter @repo/core smoke:prospecting "Real Estate" Lebanon Beirut
 */
import { DemoSalesAI, type SalesBusinessContext } from "@repo/ai";
import { runProspectingAgent } from "./agent";

const [industry = "Real Estate", country = "Lebanon", city = ""] = process.argv.slice(2);

const business = {
  companyName: "Smoke Test",
  companyDescription: "",
  website: "",
  offering: {
    name: "Websites",
    description: "Websites for agencies.",
    priceRange: "",
    pricingModel: null,
    benefits: [],
    features: [],
    differentiators: [],
  },
  icp: {
    industries: [industry],
    companySizes: [],
    countries: [country],
    cities: city ? [city] : [],
    jobTitles: [],
    characteristics: [],
  },
  valueProposition: { whyBuy: "", problemSolved: "", difference: "", outcomes: [] },
  qualificationNotes: "",
  tone: { style: "CONSULTATIVE", customInstructions: "" },
  language: "en",
  matchProspectLanguage: false,
  responseLength: "SHORT",
  discloseAutomation: false,
  playbook: {
    openingStyle: "",
    qualificationQuestions: [],
    pricingPolicy: "",
    discountPolicy: "",
    competitorPositioning: "",
    meetingRules: "",
    followUpRules: "",
    forbiddenClaims: [],
    escalationRules: [],
    objections: [],
  },
} satisfies SalesBusinessContext;

const started = Date.now();
const result = await runProspectingAgent({
  ai: new DemoSalesAI(),
  business,
  criteria: {
    industries: [industry],
    countries: [country],
    cities: city ? [city] : [],
    companySizes: [],
    keywords: "",
    count: 8,
  },
  depth: "quick",
  exclude: { names: new Set(), domains: new Set() },
  meta: {},
  onProgress: (m) => console.log(`… ${m}`),
});
console.log(`\n${result.summary} (${Math.round((Date.now() - started) / 1000)} s)`);
console.log(result.stats);
for (const p of result.prospects) {
  console.log(
    `\n• ${p.companyName} — ${p.website ?? "no website"} [${p.websiteCheck}] conf ${p.confidence}`,
  );
  console.log(
    `  ${[p.city, p.country].filter(Boolean).join(", ")} | ${p.description.slice(0, 120)}`,
  );
  console.log(
    `  email: ${p.email ?? "—"}  phone: ${p.phone ?? "—"}  linkedin: ${p.linkedinUrl ?? "—"}`,
  );
  console.log(`  sources: ${p.sources.map((s) => s.url).join(" ")}`);
}
console.log("\nNotes:", result.notes);
