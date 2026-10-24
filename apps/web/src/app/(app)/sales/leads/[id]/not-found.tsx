import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@repo/ui/button";
import { EmptyState } from "@/components/common";

export default function LeadNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Lead not found"
      description="This lead was deleted, or it belongs to a different workspace. Check that you're in the right workspace, or go back to your leads."
      action={
        <Button asChild>
          <Link href="/sales/leads">Back to leads</Link>
        </Button>
      }
    />
  );
}
