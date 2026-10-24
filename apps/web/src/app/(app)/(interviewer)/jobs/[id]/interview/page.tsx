import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { can, listTemplates } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { EmptyState } from "@/components/common";
import { formatRelative, humanize, INTERVIEW_TYPE_LABELS } from "@/lib/format";
import { requireActor } from "@/server/auth-context";

export default async function JobInterviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const templates = await listTemplates(actor, id);
  const canWrite = can(actor, "template.write");
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No interview yet"
        description="Generate a structured interview with AI from this job's description and skills."
        action={
          canWrite ? { label: "Generate with AI", href: `/jobs/${id}/interview/new` } : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/jobs/${id}/interview/new`}>
              <Plus /> New interview
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Interview</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invitations</TableHead>
              <TableHead className="pr-5">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="pl-5 font-medium">
                  <Link href={`/jobs/${id}/interview/${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                  <div className="text-xs font-normal text-muted-foreground">
                    {t.durationMinutes} min{t.generatedByAi ? " · AI-generated" : ""}
                  </div>
                </TableCell>
                <TableCell>{INTERVIEW_TYPE_LABELS[t.type]}</TableCell>
                <TableCell className="tabular-nums">{t._count.questions}</TableCell>
                <TableCell>
                  <Badge variant={t.status === "PUBLISHED" ? "success" : "outline"}>
                    {humanize(t.status)}
                    {t.publishedVersion > 0 ? ` v${t.publishedVersion}` : ""}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{t._count.invitations}</TableCell>
                <TableCell className="pr-5 text-muted-foreground">
                  {formatRelative(t.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
