import type { CompanyRole } from "@repo/shared";

/**
 * Role-based access control (spec §71). Browser-safe: the UI uses the same
 * matrix to hide actions a user can't perform; the server always re-checks.
 */
export const PERMISSIONS = [
  "company.read",
  "company.update",
  "company.settings",
  "team.manage",
  "billing.manage",
  "job.read",
  "job.write",
  "template.read",
  "template.write",
  "questionBank.write",
  "candidate.read",
  "candidate.write",
  "candidate.delete",
  "invitation.send",
  "results.read",
  "results.override",
  "stage.update",
  "note.write",
  "feedback.write",
  "analytics.read",
  "audit.read",
  "privacy.manage",
  "session.terminate",
  // AI Sales Agent
  "sales.read",
  "sales.write",
  "sales.delete",
  "sales.import",
  "sales.export",
  "sales.configure",
  "sales.ai",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const ROLE_PERMISSIONS: Record<CompanyRole, ReadonlySet<Permission>> = {
  COMPANY_ADMIN: ALL,
  RECRUITER: new Set<Permission>([
    "company.read",
    "job.read",
    "job.write",
    "template.read",
    "template.write",
    "questionBank.write",
    "candidate.read",
    "candidate.write",
    "invitation.send",
    "results.read",
    "results.override",
    "stage.update",
    "note.write",
    "feedback.write",
    "analytics.read",
    "session.terminate",
  ]),
  HIRING_MANAGER: new Set<Permission>([
    "company.read",
    "job.read",
    "template.read",
    "candidate.read",
    "results.read",
    "stage.update",
    "note.write",
    "feedback.write",
    "analytics.read",
  ]),
  REVIEWER: new Set<Permission>([
    "company.read",
    "job.read",
    "candidate.read",
    "results.read",
    "note.write",
    "feedback.write",
  ]),
  SALES_MANAGER: new Set<Permission>([
    "company.read",
    "analytics.read",
    "sales.read",
    "sales.write",
    "sales.delete",
    "sales.import",
    "sales.export",
    "sales.configure",
    "sales.ai",
  ]),
  SALES_REP: new Set<Permission>([
    "company.read",
    "sales.read",
    "sales.write",
    "sales.import",
    "sales.ai",
  ]),
  VIEWER: new Set<Permission>(["company.read", "sales.read"]),
};

export function roleHasPermission(role: CompanyRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: CompanyRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  COMPANY_ADMIN: "Admin",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  REVIEWER: "Reviewer",
  SALES_MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  VIEWER: "Viewer",
};

/** Which product each role mainly works in (used to pick a landing page). */
export const ROLE_HOME_PRODUCT: Record<CompanyRole, "interviewer" | "sales-agent" | null> = {
  COMPANY_ADMIN: null,
  RECRUITER: "interviewer",
  HIRING_MANAGER: "interviewer",
  REVIEWER: "interviewer",
  SALES_MANAGER: "sales-agent",
  SALES_REP: "sales-agent",
  VIEWER: null,
};
