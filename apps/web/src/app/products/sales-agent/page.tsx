import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  BookOpenCheck,
  Bot,
  CalendarCheck,
  Check,
  FileSearch,
  Filter,
  Gauge,
  Lightbulb,
  Lock,
  MailCheck,
  MessageSquareReply,
  Radar,
  Repeat,
  ScrollText,
  Target,
  UserCheck,
} from "lucide-react";
import { PRODUCTS } from "@repo/config";
import { listProductPlans } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";
import { formatPrice } from "@/components/marketplace/product-card";
import { getCurrentUser } from "@/server/auth-context";

const product = PRODUCTS["sales-agent"];

export const metadata: Metadata = { title: product.name, description: product.description };

const howItWorks = [
  {
    icon: Target,
    title: "Define your ideal customer",
    body: "Describe what you sell and who you sell to, in plain language.",
  },
  {
    icon: Radar,
    title: "AI organises and researches prospects",
    body: "Import your leads; the agent scores them against your profile.",
  },
  {
    icon: Lightbulb,
    title: "AI creates personalised outreach",
    body: "Drafts use only verified details — never invented personalisation.",
  },
  {
    icon: Repeat,
    title: "AI follows up",
    body: "Sequences stop automatically on replies, meetings and opt-outs.",
  },
  {
    icon: MessageSquareReply,
    title: "AI spots interested prospects",
    body: "Replies are analysed for intent, objections and next steps.",
  },
  {
    icon: CalendarCheck,
    title: "AI books meetings",
    body: "Proposes times from your calendar — only with your permission.",
  },
];

const features = [
  {
    icon: Gauge,
    title: "Explainable lead scoring",
    body: "Every score shows each factor, its reason and how confident it is. Unknown data is never guessed.",
    live: true,
  },
  {
    icon: Filter,
    title: "Qualification rules",
    body: "Define what makes a good lead; required rules automatically rule out poor fits.",
    live: true,
  },
  {
    icon: Bot,
    title: "Ask Sales AI",
    body: "A copilot on every lead: approach, next step, qualification and first drafts.",
    live: true,
  },
  {
    icon: FileSearch,
    title: "Duplicate-safe imports",
    body: "CSV imports with automatic column mapping, preview and duplicate detection.",
    live: true,
  },
  {
    icon: ScrollText,
    title: "Full activity timeline",
    body: "Every AI and human action is logged on the lead and in the activity feed.",
    live: true,
  },
  {
    icon: Ban,
    title: "Opt-outs that stick",
    body: "Do-not-contact is permanent and enforced on the server — the AI can't override it.",
    live: true,
  },
  {
    icon: MailCheck,
    title: "Email outreach & inbox",
    body: "Send, receive and thread email from your own mailbox with approval workflows.",
    live: false,
  },
  {
    icon: Repeat,
    title: "Sequences & follow-ups",
    body: "Multi-step sequences with stop conditions, sending limits and suppression lists.",
    live: false,
  },
];

const loop = [
  "Discover",
  "Research",
  "Qualify",
  "Personalise",
  "Contact",
  "Listen",
  "Follow up",
  "Book meeting",
  "Update CRM",
  "Learn",
];

const integrations = [
  { name: "CSV / Excel export", live: true },
  { name: "Gmail", live: false },
  { name: "Microsoft Outlook", live: false },
  { name: "HubSpot", live: false },
  { name: "Google Calendar", live: false },
  { name: "Salesforce · Pipedrive", live: false },
];

const faqs = [
  {
    q: "Will the AI send emails without my approval?",
    a: "No. The default mode is “approval required”: the agent prepares messages and you approve them. You can switch to fully assisted (you send) or allow automatic sending for specific message types.",
  },
  {
    q: "Does it make things up about prospects?",
    a: "It's designed not to. Every statement is labelled verified, inferred or unknown, personalisation only uses verified details, and missing information stays missing.",
  },
  {
    q: "What happens when someone asks to be removed?",
    a: "The lead is marked do-not-contact permanently. No sequence, follow-up or AI recommendation will contact them again.",
  },
  {
    q: "Can it write in Arabic and French?",
    a: "Yes. Set your default language, and optionally let the agent reply in the prospect's language.",
  },
  {
    q: "Who can see our leads?",
    a: "Only members of your workspace with a sales role. Data is isolated per company and every access is permission-checked on the server.",
  },
];

export default async function SalesAgentLandingPage() {
  const user = await getCurrentUser();
  const plans = await listProductPlans("sales-agent");
  const cta = user ? "/marketplace/sales-agent" : "/register";
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
      />
      <MarketingHeader signedIn={Boolean(user)} />
      <main id="main-content">
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <UserCheck className="size-3.5 text-primary" aria-hidden="true" />
            {product.name}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
            Your AI <span className="text-primary">sales employee.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            Find prospects, start conversations, follow up, and book meetings — without manually
            managing every lead.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href={cta}>
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </section>

        <section className="border-y bg-muted/30 py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Leads go cold while you&apos;re busy
              </h2>
              <p className="mt-4 text-muted-foreground">
                Spreadsheets of prospects nobody has researched. Follow-ups that slip. Interested
                replies buried in an inbox. Small teams can&apos;t give every lead the attention it
                deserves.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                "Knows your offer and your ideal customer",
                "Puts the best-fit leads at the top, with reasons",
                "Prepares the next step for every lead",
                "Keeps a complete, honest record of what it did",
              ].map((item) => (
                <li key={item} className="flex gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
                  <BadgeCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {howItWorks.map((step, i) => (
              <li key={step.title} className="rounded-2xl border bg-card p-6 shadow-xs">
                <span
                  className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <step.icon className="size-5" />
                </span>
                <p className="mt-4 text-xs font-medium text-muted-foreground">Step {i + 1}</p>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 rounded-2xl border bg-card p-6">
            <h3 className="text-sm font-semibold">The core loop</h3>
            <ol
              className="mt-4 flex flex-wrap items-center gap-2 text-sm"
              aria-label="Sales agent core loop"
            >
              {loop.map((stage, i) => (
                <li key={stage} className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1">{stage}</span>
                  {i < loop.length - 1 ? (
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Features</h2>
              <p className="mt-3 text-muted-foreground">
                Available today, and what&apos;s rolling out next.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <f.icon className="size-5 text-primary" aria-hidden="true" />
                    {f.live ? null : <Badge variant="muted">Coming soon</Badge>}
                  </div>
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
              <p className="mt-2 text-muted-foreground">
                Works with the tools you already use. Integrations are only active once you connect
                and authorise them.
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-2">
                {integrations.map((i) => (
                  <li
                    key={i.name}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    {i.name}
                    {i.live ? (
                      <Check className="size-4 text-primary" aria-label="Available" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Soon</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Security & compliance</h2>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Workspace data is isolated and permission-checked on every request",
                  "The AI can't change data directly — validated suggestions only",
                  "Instructions hidden in emails or lead notes are ignored",
                  "Opt-outs, suppression and data deletion built in",
                  "Every AI action and human override is audited",
                ].map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
              <p className="mt-3 text-muted-foreground">
                Every plan starts with a 14-day free trial of Pro. No card required.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.key} className="flex flex-col rounded-2xl border bg-card p-6">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">
                    {formatPrice(plan.priceMonthlyCents, plan.currency)}
                  </p>
                  {plan.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  ) : null}
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">FAQ</h2>
          <div className="mt-10 divide-y rounded-2xl border bg-card">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <BookOpenCheck
                    className="size-4 shrink-0 text-muted-foreground group-open:text-primary"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Hire your AI sales employee</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Brief it in minutes. See your best leads today.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href={cta}>
                Start free <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
