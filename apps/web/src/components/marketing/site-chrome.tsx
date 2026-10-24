import Link from "next/link";
import { brand, listProducts } from "@repo/config";
import { Button } from "@repo/ui/button";
import { BrandLogo, ThemeToggle } from "@/components/brand";

/** Public site header: product links + sign in / start free (or open workspace). */
export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
      <BrandLogo />
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
        <Link
          href="/#employees"
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:block"
        >
          AI employees
        </Link>
        <Link
          href="/products/interviewer"
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground lg:block"
        >
          Interviewer
        </Link>
        <Link
          href="/products/sales-agent"
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground lg:block"
        >
          Sales Agent
        </Link>
        <ThemeToggle />
        {signedIn ? (
          <Button asChild size="sm">
            <Link href="/home">Open workspace</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Start free</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  const products = listProducts().filter((p) => p.landingPath);
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <BrandLogo />
        <div className="flex flex-wrap justify-center gap-5">
          {products.map((p) => (
            <Link key={p.key} href={p.landingPath!} className="hover:text-foreground">
              {p.name}
            </Link>
          ))}
          <Link href={brand.legal.privacyUrl} className="hover:text-foreground">
            Privacy
          </Link>
          <Link href={brand.legal.termsUrl} className="hover:text-foreground">
            Terms
          </Link>
        </div>
        <p>
          © {new Date().getFullYear()} {brand.productName}
        </p>
      </div>
    </footer>
  );
}
