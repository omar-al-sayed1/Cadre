import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PRODUCTS } from "@repo/config";
import { listProductAccess, listProductPlans, type ProductAccess } from "@repo/core";
import { db } from "@repo/database";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { BrandLogo, ThemeToggle } from "@/components/brand";
import { StartTrialButton } from "@/components/marketplace/trial-button";
import { ProductIcon } from "@/components/product-icon";
import { requireUser } from "@/server/auth-context";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Get started" };

interface Step {
  title: string;
  description: string;
  done: boolean;
  href?: string;
}

async function interviewerSteps(companyId: string): Promise<Step[]> {
  const [job, template, invitation] = await Promise.all([
    db.job.findFirst({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    db.interviewTemplate.findFirst({
      where: { companyId, status: "PUBLISHED", deletedAt: null },
      select: { id: true, jobId: true },
    }),
    db.interviewInvitation.findFirst({ where: { candidate: { companyId } }, select: { id: true } }),
  ]);
  return [
    {
      title: "Create your first job",
      description: "Describe the role and the skills that matter.",
      done: Boolean(job),
      href: "/jobs/new",
    },
    {
      title: "Generate an interview",
      description: "Let AI draft a structured interview, then review and publish it.",
      done: Boolean(template),
      href: job ? `/jobs/${job.id}/interview/new` : undefined,
    },
    {
      title: "Invite your first candidate",
      description: "Send a secure interview link by email or copy it.",
      done: Boolean(invitation),
      href: template ? `/jobs/${template.jobId}?invite=1` : undefined,
    },
  ];
}

async function salesSteps(companyId: string): Promise<Step[]> {
  const [agent, lead] = await Promise.all([
    db.agent.findUnique({
      where: { companyId_type: { companyId, type: "SALES" } },
      select: { onboardingCompletedAt: true },
    }),
    db.salesLead.findFirst({ where: { companyId, deletedAt: null }, select: { id: true } }),
  ]);
  return [
    {
      title: "Brief your AI Sales Agent",
      description: "What you sell, who you sell to, and how.",
      done: Boolean(agent?.onboardingCompletedAt),
      href: "/sales/setup",
    },
    {
      title: "Add your first leads",
      description: "Import a CSV or add leads — each is scored automatically.",
      done: Boolean(lead),
      href: "/sales/leads",
    },
  ];
}

function StepList({ steps, label }: { steps: Step[]; label: string }) {
  const next = steps.find((s) => !s.done);
  return (
    <ol className="space-y-3" aria-label={label}>
      {steps.map((step, i) => {
        const isCurrent = step === next;
        return (
          <li
            key={step.title}
            className={cn(
              "rounded-xl border bg-card p-5 shadow-xs",
              isCurrent && "ring-2 ring-primary/30",
            )}
          >
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  step.done
                    ? "border-success bg-success text-white"
                    : isCurrent
                      ? "border-primary text-primary"
                      : "text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">
                  {step.title}
                  <span className="sr-only">
                    {step.done ? " (completed)" : isCurrent ? " (current step)" : ""}
                  </span>
                </h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {isCurrent && step.href ? (
                <Button asChild size="sm">
                  <Link href={step.href}>
                    Start <ArrowRight />
                  </Link>
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ProductChoice({
  access,
  trialDays,
  canStart,
}: {
  access: ProductAccess;
  trialDays: number;
  canStart: boolean;
}) {
  const { product } = access;
  return (
    <article className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs">
      <ProductIcon name={product.icon} />
      <h3 className="mt-4 text-lg font-semibold">{product.name}</h3>
      <p className="text-sm font-medium text-primary">{product.tagline}</p>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{product.description}</p>
      <div className="mt-5">
        {canStart ? (
          <StartTrialButton
            productKey={product.key}
            productName={product.name}
            trialDays={trialDays}
            next={product.key === "sales-agent" ? "/sales/setup" : "/onboarding"}
            className="w-full"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Ask a workspace admin to start a trial.</p>
        )}
      </div>
    </article>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const membership = await db.companyMember.findFirst({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(user.activeCompanyId ? { companyId: user.activeCompanyId } : {}),
    },
    select: { companyId: true, role: true },
  });
  const companyId = membership?.companyId ?? null;
  const showCompanyForm = !companyId || params.new === "1";
  const products = companyId && !showCompanyForm ? await listProductAccess(companyId) : [];
  const subscribed = products.filter((p) => p.status !== null);
  const choices = products.filter(
    (p) => p.status === null && p.product.availability === "available",
  );
  const trialDays = Object.fromEntries(
    await Promise.all(
      choices.map(
        async (p) =>
          [
            p.product.key,
            (await listProductPlans(p.product.key)).find(
              (plan) => plan.key === p.product.trialPlanKey,
            )?.trialDays ?? 14,
          ] as const,
      ),
    ),
  );
  const isAdmin = membership?.role === "COMPANY_ADMIN";
  const interviewer = subscribed.some((p) => p.product.key === "interviewer")
    ? await interviewerSteps(companyId!)
    : null;
  const sales = subscribed.some((p) => p.product.key === "sales-agent")
    ? await salesSteps(companyId!)
    : null;

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
        <BrandLogo />
        <ThemeToggle />
      </header>
      <main id="main-content" className="mx-auto max-w-4xl px-5 pb-16">
        <div className="mt-4 mb-8">
          <p className="text-sm font-medium text-primary">Welcome, {user.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {showCompanyForm
              ? "Let's set up your workspace"
              : subscribed.length === 0
                ? "Hire your first AI employee"
                : "Let's get your AI workforce working"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {showCompanyForm
              ? "Your workspace holds your team, data and AI employees."
              : subscribed.length === 0
                ? "Each AI employee comes with a free trial. You can add more any time."
                : "A few short steps for each AI employee. You can change everything later."}
          </p>
        </div>

        {showCompanyForm ? (
          <section
            className="rounded-xl border bg-card p-6 shadow-xs"
            aria-labelledby="company-step"
          >
            <h2 id="company-step" className="font-semibold">
              Create your company
            </h2>
            <p className="text-sm text-muted-foreground">
              Your workspace for AI employees, data and your team.
            </p>
            <div className="mt-5">
              <CompanyForm />
            </div>
          </section>
        ) : (
          <div className="space-y-10">
            {interviewer ? (
              <section aria-labelledby="ob-interviewer" className="space-y-3">
                <h2 id="ob-interviewer" className="flex items-center gap-2 font-semibold">
                  <ProductIcon name={PRODUCTS.interviewer.icon} size="sm" />{" "}
                  {PRODUCTS.interviewer.name}
                </h2>
                <StepList steps={interviewer} label="AI Interviewer setup" />
              </section>
            ) : null}
            {sales ? (
              <section aria-labelledby="ob-sales" className="space-y-3">
                <h2 id="ob-sales" className="flex items-center gap-2 font-semibold">
                  <ProductIcon name={PRODUCTS["sales-agent"].icon} size="sm" />{" "}
                  {PRODUCTS["sales-agent"].name}
                </h2>
                <StepList steps={sales} label="AI Sales Agent setup" />
              </section>
            ) : null}
            {choices.length > 0 ? (
              <section aria-labelledby="ob-choose" className="space-y-3">
                <h2 id="ob-choose" className="font-semibold">
                  {subscribed.length === 0
                    ? "Choose an AI employee to start with"
                    : "Add another AI employee"}
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {choices.map((p) => (
                    <ProductChoice
                      key={p.product.key}
                      access={p}
                      trialDays={trialDays[p.product.key] ?? 14}
                      canStart={isAdmin && p.canStartTrial}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            <div className="flex justify-end">
              <Button asChild variant={subscribed.length > 0 ? "default" : "ghost"}>
                <Link href="/home">
                  {subscribed.length > 0 ? "Go to my workspace" : "Skip for now"}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
