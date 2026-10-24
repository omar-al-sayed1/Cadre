import Link from "next/link";
import { Telescope } from "lucide-react";
import { Button } from "@repo/ui/button";

/** Entry point to AI prospect discovery. */
export function FindLeadsButton({ variant = "outline" }: { variant?: "default" | "outline" }) {
  return (
    <Button asChild variant={variant}>
      <Link href="/sales/discover">
        <Telescope aria-hidden="true" /> Find leads with AI
      </Link>
    </Button>
  );
}
