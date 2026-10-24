import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  GitCompareArrows,
  Lock,
  MessageSquareText,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { brand, PRODUCTS } from "@repo/config";
import { Button } from "@repo/ui/button";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";
import { getCurrentUser } from "@/server/auth-context";

const steps = [
  {
    icon: ClipboardList,
    title: "Create the interview",
    body: "Describe the role and its skills. AI drafts a structured interview with sections, questions and a scoring rubric you can edit.",
  },
  {
    icon: Send,
    title: "Invite candidates",
    body: "Send a secure, personal link. Candidates interview whenever it suits them — by voice or text, on any device.",
  },
  {
    icon: AudioLines,
    title: "AI conducts the interview",
    body: "A natural, adaptive conversation with relevant follow-ups, kept fair and on-topic by deterministic guardrails.",
  },
  {
    icon: UserCheck,
    title: "Review the evidence",
    body: "Scores, strengths and concerns — each backed by the candidate's own answers. Your team makes the decision.",
  },
];

const features = [
  {
    icon: BrainCircuit,
    title: "Dynamic AI interviews",
    body: "Follow-ups when an answer leaves a gap, adaptive difficulty, and resume-aware questions — within the structure you define.",
  },
  {
    icon: AudioLines,
    title: "Voice conversations",
    body: "Speech in, speech out, interruptions handled gracefully. A full text mode keeps the interview accessible to everyone.",
  },
  {
    icon: MessageSquareText,
    title: "Structured evaluation",
    body: "Weighted rubrics, per-skill scores with confidence, and question-by-question assessments that cite the transcript.",
  },
  {
    icon: GitCompareArrows,
    title: "Candidate comparison",
    body: "Compare candidates side by side on the skills that matter for the role — with confidence, not just a number.",
  },
  {
    icon: BarChart3,
    title: "Interview analytics",
    body: "Completion rates, drop-off points, score distributions and skill trends across your pipeline.",
  },
  {
    icon: Lock,
    title: "Security by default",
    body: "Hashed invitation tokens, prompt-injection defences, audit logs, retention controls and role-based access.",
  },
];

const principles = [
  "Scores only job-relevant evidence — never accent, appearance or protected characteristics",
  "Every score links back to the candidate's actual answers",
  "Recommendations are decision support; humans make hiring decisions",
  "Recruiters can override any score, with an audited reason",
  "Integrity signals are objective and never treated as accusations",
  "Configurable data retention and candidate deletion requests",
];

export const metadata: Metadata = {
  title: PRODUCTS.interviewer.name,
  description: PRODUCTS.interviewer.description,
};

export default async function InterviewerLandingPage() {
  const user = await getCurrentUser();
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]"
      />
      <MarketingHeader signedIn={Boolean(user)} />

      <main id="main-content">
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {PRODUCTS.interviewer.name} · AI-assisted recruiting
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
            Interview every candidate consistently — <span className="text-primary">with AI.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            Let AI handle first-round interviews while your hiring team focuses on the candidates
            who deserve deeper attention. Natural voice interviews, structured evaluation and
            evidence your hiring team can trust.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href={user ? "/marketplace/interviewer" : "/register"}>
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <a href="#how-it-works">Watch how it works</a>
            </Button>
          </div>

          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="rounded-2xl border bg-card/80 p-2 shadow-2xl shadow-primary/5 backdrop-blur">
              <div className="grid gap-2 rounded-xl border bg-background p-4 text-left sm:grid-cols-[1.1fr_1fr] sm:p-6">
                <div className="flex flex-col items-center justify-center rounded-xl bg-muted/50 px-6 py-10">
                  <div className="relative flex size-24 items-center justify-center">
                    <span className="absolute inset-0 animate-ring-pulse rounded-full bg-primary/25" />
                    <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-2xl font-semibold text-primary-foreground shadow-lg">
                      A
                    </span>
                  </div>
                  <p className="mt-4 font-semibold">{brand.defaultInterviewerName}</p>
                  <p className="text-xs text-muted-foreground">AI Interviewer · speaking</p>
                  <div className="mt-4 flex h-8 items-center gap-1" aria-hidden="true">
                    {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.95, 0.5].map((h, i) => (
                      <span
                        key={i}
                        className="w-1 origin-center animate-voice-bar rounded-full bg-primary/80"
                        style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-1 text-sm">
                  <div className="rounded-xl rounded-tl-sm bg-muted px-3.5 py-2.5">
                    You mentioned using Spring Boot for an inventory system. How did you structure
                    the application?
                  </div>
                  <div className="ml-6 rounded-xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-primary-foreground">
                    I split it into controllers, services and repositories, with DTOs at the API
                    boundary…
                  </div>
                  <div className="rounded-xl rounded-tl-sm bg-muted px-3.5 py-2.5">
                    That&apos;s helpful. What responsibility did the service layer have?
                  </div>
                  <div className="mt-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                    <span
                      className="size-2 animate-pulse rounded-full bg-success"
                      aria-hidden="true"
                    />
                    Live transcript · 14:32 remaining
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              From job description to evidence-backed shortlist in four steps.
            </p>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="relative rounded-xl border bg-card p-6 shadow-xs">
                  <span className="text-xs font-semibold text-primary">Step {i + 1}</span>
                  <step.icon className="mt-3 size-6 text-foreground" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-3xl font-semibold tracking-tight">
              Built for real hiring teams
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              Not a chatbot — an interviewer that follows your structure and documents its evidence.
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="rounded-xl border bg-card p-6 shadow-xs">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="border-y bg-muted/30 py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                <Scale className="size-4" aria-hidden="true" /> Security &amp; fairness
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Decision support, not decision making
              </h2>
              <p className="mt-4 text-muted-foreground">
                Let AI handle first-round interviews while your hiring team focuses on the
                candidates who deserve deeper attention. Every evaluation is transparent,
                evidence-based and reviewable.
              </p>
            </div>
            <ul className="grid gap-3">
              {principles.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-5 text-center">
            <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Run your first AI interview today
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Create a role, generate an interview and invite a candidate in minutes.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg">
                <Link href={user ? "/marketplace/interviewer" : "/register"}>
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
