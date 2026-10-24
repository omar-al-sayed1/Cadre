"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailPlus, Trash2, X } from "lucide-react";
import type { CompanyRole } from "@repo/shared";
import { inviteMemberSchema } from "@repo/validation";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { FormError, useFormErrors } from "@/components/forms";
import { CopyField } from "@/components/invite-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatDate, formatRelative, ROLE_OPTIONS } from "@/lib/format";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  lastLoginAt: string | null;
}

export function TeamManager({
  members,
  invitations,
  canManage,
  currentUserId,
}: {
  members: Member[];
  invitations: Array<{ id: string; email: string; role: CompanyRole; expiresAt: string }>;
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("RECRUITER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { formError, validate, handleError } = useFormErrors();
  const fail = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : "Something went wrong.");

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              {ROLE_OPTIONS.map((r) => `${r.label}: ${r.description.toLowerCase()}`).join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormError message={formError} />
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const data = validate(inviteMemberSchema, { email, role });
                if (!data) return;
                setSending(true);
                try {
                  const result = await api<{ url: string }>("/api/team/invitations", {
                    method: "POST",
                    body: data,
                  });
                  setInviteUrl(result.url);
                  setEmail("");
                  toast.success("Invitation sent");
                  router.refresh();
                } catch (err) {
                  handleError(err);
                } finally {
                  setSending(false);
                }
              }}
            >
              <Input
                aria-label="Email address"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sm:max-w-xs"
              />
              <Select value={role} onValueChange={(v) => setRole(v as CompanyRole)}>
                <SelectTrigger className="sm:w-44" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" loading={sending}>
                <MailPlus /> Send invite
              </Button>
            </form>
            {inviteUrl ? <CopyField value={inviteUrl} label="Invite link (also emailed)" /> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="pl-5">
                    <p className="font-medium">
                      {m.name}
                      {m.userId === currentUserId ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </TableCell>
                  <TableCell>
                    {canManage && m.userId !== currentUserId ? (
                      <Select
                        value={m.role}
                        onValueChange={async (v) => {
                          try {
                            await api(`/api/team/members/${m.userId}`, {
                              method: "PATCH",
                              body: { role: v },
                            });
                            toast.success("Role updated");
                            router.refresh();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        <SelectTrigger size="sm" className="w-40" aria-label={`Role for ${m.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">
                        {ROLE_OPTIONS.find((r) => r.value === m.role)?.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.lastLoginAt ? formatRelative(m.lastLoginAt) : "—"}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {canManage && m.userId !== currentUserId ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${m.name}`}
                        onClick={async () => {
                          try {
                            await api(`/api/team/members/${m.userId}`, { method: "DELETE" });
                            router.refresh();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    {i.email}{" "}
                    <span className="text-muted-foreground">
                      · {ROLE_OPTIONS.find((r) => r.value === i.role)?.label} · expires{" "}
                      {formatDate(i.expiresAt)}
                    </span>
                  </span>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke invitation for ${i.email}`}
                      onClick={async () => {
                        await api(`/api/team/invitations/${i.id}`, { method: "DELETE" }).catch(
                          fail,
                        );
                        router.refresh();
                      }}
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
