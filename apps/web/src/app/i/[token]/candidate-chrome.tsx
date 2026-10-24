import { brand } from "@repo/config";
import { ThemeToggle } from "@/components/brand";

export function CandidateChrome({
  company,
  children,
}: {
  company: { name: string; logoUrl: string | null };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="size-8 rounded-lg object-cover"
            />
          ) : (
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {company.name[0]}
            </span>
          )}
          <span className="font-semibold">{company.name}</span>
        </div>
        <ThemeToggle />
      </header>
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-12">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Interview powered by {brand.productName}
      </footer>
    </div>
  );
}
