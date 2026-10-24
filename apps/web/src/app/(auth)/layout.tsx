import { CheckCircle2 } from "lucide-react";
import { brand } from "@repo/config";
import { BrandLogo, ThemeToggle } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <ThemeToggle />
        </div>
        <main id="main-content" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden border-l bg-muted/40 lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div
          aria-hidden="true"
          className="absolute -top-40 -right-40 size-[480px] rounded-full bg-primary/10 blur-3xl"
        />
        <p className="text-sm font-medium text-primary">{brand.tagline}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
          Structured first-round interviews, with evidence you can trust.
        </h2>
        <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
          {[
            "AI-generated interviews tailored to each role",
            "Natural voice or text conversations with smart follow-ups",
            "Evidence-backed scores, strengths and concerns",
            "Your team always makes the final decision",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
