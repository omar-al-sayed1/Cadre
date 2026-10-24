import Link from "next/link";
import { Button } from "@repo/ui/button";
import { BrandLogo } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-5 text-center">
      <BrandLogo />
      <div>
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-1 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
