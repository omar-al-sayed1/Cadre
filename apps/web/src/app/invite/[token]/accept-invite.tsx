"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@repo/ui/button";
import { api, ApiError } from "@/lib/api-client";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            await api("/api/team/accept", { method: "POST", body: { token } });
            router.replace("/home");
            router.refresh();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't accept the invitation.");
            setLoading(false);
          }
        }}
      >
        Accept invitation
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
