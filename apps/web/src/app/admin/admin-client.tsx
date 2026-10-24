"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";

const fail = (e: unknown) =>
  toast.error(e instanceof ApiError ? e.message : "Something went wrong.");

export function FlagControls({
  flagKey,
  enabled,
  rollout,
}: {
  flagKey: string;
  enabled: boolean;
  rollout: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pct, setPct] = useState(String(rollout));
  const save = async (patch: { enabled?: boolean; rolloutPercentage?: number }) => {
    try {
      await api(`/api/admin/flags/${flagKey}`, { method: "PATCH", body: patch });
      toast.success("Flag updated");
      router.refresh();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`${flagKey} rollout percentage`}
          className="h-8 w-16"
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          onBlur={() =>
            void save({ rolloutPercentage: Math.max(0, Math.min(100, Number(pct) || 0)) })
          }
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <Switch
        aria-label={`Toggle ${flagKey}`}
        checked={on}
        onCheckedChange={(v) => {
          setOn(v);
          void save({ enabled: v });
        }}
      />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  EXPIRED: "Expired",
};

/** One product's subscription for a company: "Active · <plan>", or canceled. */
export function SubscriptionSelect({
  companyId,
  productKey,
  productName,
  status,
  planKey,
  plans,
}: {
  companyId: string;
  productKey: string;
  productName: string;
  status: string | null;
  planKey: string | null;
  plans: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const current = status ? `${status}:${planKey ?? ""}` : "NONE";
  return (
    <Select
      value={current}
      onValueChange={async (value) => {
        const [nextStatus, nextPlan] = value.split(":");
        try {
          await api(`/api/admin/companies/${companyId}/subscriptions`, {
            method: "POST",
            body: { productKey, status: nextStatus, ...(nextPlan ? { planKey: nextPlan } : {}) },
          });
          toast.success(`${productName} updated`);
          router.refresh();
        } catch (e) {
          fail(e);
        }
      }}
    >
      <SelectTrigger size="sm" className="w-44" aria-label={`${productName} subscription`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {status === null ? <SelectItem value="NONE">Not subscribed</SelectItem> : null}
        {status && !["ACTIVE", "CANCELED"].includes(status) ? (
          <SelectItem value={current}>
            {STATUS_LABELS[status]} · {plans.find((p) => p.key === planKey)?.name ?? "no plan"}
          </SelectItem>
        ) : null}
        {plans.map((p) => (
          <SelectItem key={p.key} value={`ACTIVE:${p.key}`}>
            Active · {p.name}
          </SelectItem>
        ))}
        {status !== null ? (
          <SelectItem value={`CANCELED:${planKey ?? ""}`}>Canceled</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await api(`/api/admin/jobs/${jobId}/retry`, { method: "POST", body: {} });
          toast.success("Job re-queued");
          router.refresh();
        } catch (e) {
          fail(e);
        }
      }}
    >
      <RotateCcw /> Retry
    </Button>
  );
}
