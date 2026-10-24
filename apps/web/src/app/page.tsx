import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";
import { brand, listProducts } from "@repo/config";
import { listProductPlans } from "@repo/core";
import { Button } from "@repo/ui/button";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";
import { ProductCard, startingPrice } from "@/components/marketplace/product-card";
import { getCurrentUser } from "@/server/auth-context";

const steps = [
  {
    icon: Building2,
    title: "Create your workspace",
    body: "One account for your company, your team and all of your AI employees.",
  },
  {
    icon: Users,
    title: "Hire AI employees",
    body: "Pick the specialists you need from the marketplace. Each starts with a free trial.",
  },
  {
    icon: UserCog,
    title: "Brief them like new hires",
    body: "Tell them about your business in plain language — what you do, who you serve, how you work.",
  },
  {
    icon: Eye,
    title: "They work, you stay in charge",
    body: "Every action is logged and explainable. You approve, correct or pause them at any time.",
  },
];

const principles = [
  {
    icon: Scale,
    title: "Human in the loop",
    body: "AI employees recommend and prepare. People make the important decisions, and can override anything.",
  },
  {
    icon: CheckCircle2,
    title: "No invented facts",
    body: "Answers cite their sources. Unknown information is labelled unknown — never guessed.",
  },
  {
    icon: Lock,
    title: "Your data stays yours",
    body: "Strict tenant isolation, encrypted secrets, audit logs, retention controls and deletion on request.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const products = listProducts();
  const prices = Object.fromEntries(
    await Promise.all(
      products
        .filter((p) => p.availability === "available")
        .map(
          async (p) =>
            [
              p.key,
              startingPrice((await listProductPlans(p.key)).map((plan) => plan.priceMonthlyCents)),
            ] as const,
        ),
    ),
  );
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
      />
      <MarketingHeader signedIn={Boolean(user)} />

      <main id="main-content">
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {brand.productName} · the AI workforce platform
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
            Build your <span className="text-primary">AI workforce.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            AI employees that help your business hire, sell, support customers, and automate
            everyday work.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="xl">
              <a href="#employees">
                Explore AI employees <ArrowRight />
              </a>
            </Button>
            <Button asChild size="xl" variant="outline">
              <Link href={user ? "/home" : "/register"}>
                {user ? "Open your workspace" : "Start free"}
              </Link>
            </Button>
          </div>
        </section>

        <section id="employees" className="scroll-mt-8 border-y bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">AI employees</h2>
              <p className="mt-3 text-muted-foreground">
                Hire only the specialists you need. Each one is subscribed separately — more are
                coming soon.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard
                  key={p.key}
                  product={p}
                  price={prices[p.key] ?? null}
                  href={p.landingPath}
                  cta={`Explore ${p.name.replace(/^AI /, "")}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted-foreground">
              Like building a team — without the hiring overhead.
            </p>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
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
        </section>

        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Serious AI for serious businesses
              </h2>
              <p className="mt-3 text-muted-foreground">
                Built for real work with real customers and candidates.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {principles.map((p) => (
                <div key={p.title} className="rounded-2xl border bg-card p-6">
                  <p.icon className="size-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{p.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-5 text-center">
            <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Hire your first AI employee today
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Create a workspace in a minute and start a free trial — no card required.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg">
                <Link href={user ? "/marketplace" : "/register"}>
                  Start free <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
