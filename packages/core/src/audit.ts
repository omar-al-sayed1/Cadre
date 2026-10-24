import { asJson, db, type TransactionClient } from "@repo/database";
import { logger } from "@repo/shared";
import type { ActorContext } from "./context";

/**
 * Audit log (spec §72). Records who did what to which entity. Metadata must not
 * contain secrets or unnecessary personal data.
 */
export const AUDIT_ACTIONS = {
  companyCreated: "company.created",
  companyUpdated: "company.updated",
  companySettingsUpdated: "company.settings_updated",
  memberInvited: "team.member_invited",
  memberJoined: "team.member_joined",
  memberRoleChanged: "team.member_role_changed",
  memberRemoved: "team.member_removed",
  jobCreated: "job.created",
  jobUpdated: "job.updated",
  jobStatusChanged: "job.status_changed",
  jobDeleted: "job.deleted",
  templateCreated: "template.created",
  templateUpdated: "template.updated",
  templatePublished: "template.published",
  templateArchived: "template.archived",
  candidateCreated: "candidate.created",
  candidateUpdated: "candidate.updated",
  candidateImported: "candidate.imported",
  candidateDeleted: "candidate.deleted",
  candidateStageChanged: "candidate.stage_changed",
  candidateRated: "candidate.rated",
  resumeUploaded: "resume.uploaded",
  invitationCreated: "invitation.created",
  invitationResent: "invitation.resent",
  invitationCancelled: "invitation.cancelled",
  sessionTerminated: "session.terminated",
  evaluationOverridden: "evaluation.overridden",
  evaluationRerun: "evaluation.rerun",
  noteAdded: "note.added",
  privacyDeletionRequested: "privacy.deletion_requested",
  privacyDeletionCompleted: "privacy.deletion_completed",
  retentionSweep: "privacy.retention_sweep",
  featureFlagChanged: "admin.feature_flag_changed",
  planChanged: "admin.plan_changed",
  jobRetried: "admin.job_retried",
  subscriptionTrialStarted: "subscription.trial_started",
  subscriptionCanceled: "subscription.canceled",
  subscriptionChanged: "subscription.changed",
  salesConfigUpdated: "sales.config_updated",
  salesAgentStatusChanged: "sales.agent_status_changed",
  salesLeadCreated: "sales.lead_created",
  salesLeadUpdated: "sales.lead_updated",
  salesLeadDeleted: "sales.lead_deleted",
  salesLeadStatusChanged: "sales.lead_status_changed",
  salesLeadsImported: "sales.leads_imported",
  salesAiRequested: "sales.ai_requested",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(
  actor: ActorContext | { system: true; companyId?: string | null },
  entry: AuditEntry,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  const isSystem = "system" in actor;
  try {
    await client.auditLog.create({
      data: {
        companyId: actor.companyId ?? null,
        actorUserId: isSystem ? null : actor.userId,
        actorType: isSystem ? "SYSTEM" : "USER",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: asJson(entry.metadata ?? {}),
        requestId: isSystem ? null : (actor.requestId ?? null),
        ipHash: isSystem ? null : (actor.ipHash ?? null),
      },
    });
  } catch (error) {
    // Inside a transaction the error must propagate so the change rolls back with it.
    if (tx) throw error;
    logger.error("audit.write_failed", { action: entry.action, error });
  }
}
