"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { LEAD_STATUS_META } from "@repo/sales-engine";
import type { LeadStatus } from "@repo/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/alert-dialog";
import { Button } from "@repo/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";

/** Move a lead through its lifecycle. Only transitions the state machine allows are offered. */
/** "Move stage" button that opens the status control in a popover. */
export function LeadStageButton(props: {
  leadId: string;
  status: LeadStatus;
  allowed: LeadStatus[];
  disabled?: boolean;
}) {
  if (props.allowed.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={props.disabled}>
          <ArrowRightLeft /> Move stage
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <LeadStatusControl {...props} />
      </PopoverContent>
    </Popover>
  );
}

export function LeadStatusControl({
  leadId,
  status,
  allowed,
  disabled,
}: {
  leadId: string;
  status: LeadStatus;
  allowed: LeadStatus[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [next, setNext] = useState<LeadStatus | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const optOut = next === "DO_NOT_CONTACT";

  async function apply() {
    if (!next) return;
    setSaving(true);
    try {
      await api(`/api/sales/leads/${leadId}/status`, {
        method: "POST",
        body: { status: next, reason: reason.trim() || undefined },
      });
      toast.success(`Moved to ${LEAD_STATUS_META[next].label}`);
      setNext("");
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't change the status.");
    } finally {
      setSaving(false);
    }
  }

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "DO_NOT_CONTACT"
          ? "This lead opted out. Its status is permanent."
          : "No further status changes are available."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="lead-next-status">Move to</Label>
        <Select value={next} onValueChange={(v) => setNext(v as LeadStatus)} disabled={disabled}>
          <SelectTrigger id="lead-next-status">
            <SelectValue placeholder="Choose a status" />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {next ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="lead-status-reason">Reason (optional)</Label>
            <Input
              id="lead-status-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder={optOut ? "e.g. Asked to be removed" : ""}
            />
          </div>
          {optOut ? (
            <p className="text-xs text-warning-foreground">
              Opting out is permanent: this lead will never be contacted again.
            </p>
          ) : null}
          <Button
            size="sm"
            onClick={apply}
            loading={saving}
            variant={optOut ? "destructive" : "default"}
          >
            Update status
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function LeadMenu({
  leadId,
  leadName,
  canDelete,
  canWrite,
}: {
  leadId: string;
  leadName: string;
  canDelete: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canDelete && !canWrite) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More lead actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await api(`/api/sales/leads/${leadId}/score`, { method: "POST", body: {} });
                  toast.success("Score recalculated");
                  router.refresh();
                } catch (error) {
                  toast.error(
                    error instanceof ApiError ? error.message : "Couldn't rescore this lead.",
                  );
                }
              }}
            >
              <RefreshCw /> Recalculate score
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Trash2 /> Delete lead
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {leadName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The lead and its timeline are removed from your workspace. To stop contacting someone,
              use “Do not contact” instead — that keeps the opt-out on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  await api(`/api/sales/leads/${leadId}`, { method: "DELETE" });
                  toast.success("Lead deleted");
                  router.replace("/sales/leads");
                  router.refresh();
                } catch (error) {
                  toast.error(
                    error instanceof ApiError ? error.message : "Couldn't delete the lead.",
                  );
                  setBusy(false);
                }
              }}
            >
              Delete lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
