import type {
  CandidateStage,
  CompanyRole,
  CompletionReason,
  EmploymentType,
  ExperienceLevel,
  IntegrityEventType,
  InterviewType,
  JobStatus,
  QuestionDifficulty,
  QuestionType,
  SessionStatus,
  WorkMode,
} from "@repo/shared";

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

export function formatDate(
  value: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diff / 86_400), "day");
  return formatDate(value);
}

/** Compact age for dense lists: "now", "12m", "3h", "4d", "2w", then a date. */
export function formatAgo(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 86_400 * 14) return `${Math.floor(s / 86_400)}d`;
  if (s < 86_400 * 60) return `${Math.floor(s / (86_400 * 7))}w`;
  return new Date(value).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export const STAGE_LABELS: Record<CandidateStage, string> = {
  INVITED: "Invited",
  OPENED: "Opened",
  STARTED: "Interviewing",
  COMPLETED: "Completed",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  TEMPORARY: "Temporary",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  MID: "Mid-level",
  SENIOR: "Senior",
  LEAD: "Lead",
  PRINCIPAL: "Principal",
};

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  SCREENING: "Screening",
  TECHNICAL: "Technical",
  BEHAVIORAL: "Behavioral",
  HR: "HR",
  MIXED: "Mixed",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  INTRODUCTION: "Introduction",
  GENERAL: "General",
  TECHNICAL: "Technical",
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  EXPERIENCE: "Experience",
  PROBLEM_SOLVING: "Problem solving",
  SYSTEM_DESIGN: "System design",
  CODING: "Coding",
  FOLLOW_UP: "Follow-up",
  CLOSING: "Closing",
};

export const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const SESSION_STATUS_LABELS: Partial<Record<SessionStatus, string>> = {
  CREATED: "Not started",
  READY: "Ready",
  STARTING: "Starting",
  WAITING_FOR_CANDIDATE: "In progress",
  PROCESSING_ANSWER: "In progress",
  GENERATING_RESPONSE: "In progress",
  AI_SPEAKING: "In progress",
  CANDIDATE_SPEAKING: "In progress",
  PAUSED: "Paused",
  RECONNECTING: "Reconnecting",
  FINISHING: "Finishing",
  COMPLETED: "Completed",
  FAILED: "Ended",
  EXPIRED: "Expired",
};

export const COMPLETION_REASON_LABELS: Record<CompletionReason, string> = {
  NORMAL: "Completed normally",
  TIME_LIMIT: "Time limit reached",
  CANDIDATE_ENDED: "Ended by candidate",
  TECHNICAL_FAILURE: "Ended unexpectedly",
  ADMIN_TERMINATED: "Ended by recruiter",
  EXPIRED: "Expired",
};

export const ROLE_OPTIONS: Array<{ value: CompanyRole; label: string; description: string }> = [
  {
    value: "COMPANY_ADMIN",
    label: "Admin",
    description: "Full access, including settings, team and billing",
  },
  {
    value: "RECRUITER",
    label: "Recruiter",
    description: "Jobs, interviews, candidates and reviews",
  },
  {
    value: "HIRING_MANAGER",
    label: "Hiring manager",
    description: "Review candidates, add notes and move stages",
  },
  { value: "REVIEWER", label: "Reviewer", description: "View interviews and add notes" },
  {
    value: "SALES_MANAGER",
    label: "Sales manager",
    description: "Everything in the AI Sales Agent, including its settings",
  },
  { value: "SALES_REP", label: "Sales rep", description: "Work leads and use Sales AI" },
  { value: "VIEWER", label: "Viewer", description: "Read-only access to sales data" },
];

export const INTEGRITY_LABELS: Record<IntegrityEventType, string> = {
  TAB_HIDDEN: "Switched away from the interview tab",
  WINDOW_BLUR: "Browser window lost focus",
  CONNECTION_LOST: "Connection interrupted",
  CONNECTION_RESTORED: "Connection restored",
  LONG_RESPONSE_LATENCY: "Very long pause before answering",
  PASTE: "Pasted text into an answer",
  COPY: "Copied text",
  MULTIPLE_SESSIONS: "Interview opened in another window",
  RAPID_RECONNECTS: "Repeated reconnections",
  FULLSCREEN_EXIT: "Exited full screen",
};

export function fullName(c: { firstName: string; lastName?: string | null }): string {
  return `${c.firstName} ${c.lastName ?? ""}`.trim();
}
