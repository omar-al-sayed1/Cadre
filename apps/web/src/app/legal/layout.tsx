import { BrandLogo, ThemeToggle } from "@/components/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <BrandLogo />
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-3xl px-5 pb-16 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground"
      >
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Template text — replace with your organisation&apos;s reviewed legal documents before
          production use.
        </p>
        {children}
      </main>
    </div>
  );
}
