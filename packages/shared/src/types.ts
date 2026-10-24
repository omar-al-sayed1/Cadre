/**
 * Domain enumerations shared by the browser, API validation and services.
 * These mirror the Prisma enums one-to-one; `packages/database` has a test that
 * fails if the two drift apart.
 */

export const PLATFORM_ROLES = ["USER", "SUPER_ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const COMPANY_ROLES = [
  "COMPANY_ADMIN",
  "RECRUITER",
  "HIRING_MANAGER",
  "REVIEWER",
  "SALES_MANAGER",
  "SALES_REP",
  "VIEWER",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const COMPANY_SIZES = [
  "SIZE_1_10",
  "SIZE_11_50",
  "SIZE_51_200",
  "SIZE_201_1000",
  "SIZE_1000_PLUS",
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const JOB_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EXPERIENCE_LEVELS = [
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SKILL_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_CATEGORIES = ["TECHNICAL", "DOMAIN", "SOFT", "LANGUAGE", "TOOL"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const INTERVIEW_TYPES = ["SCREENING", "TECHNICAL", "BEHAVIORAL", "HR", "MIXED"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const DIFFICULTY_MODES = ["EASY", "MEDIUM", "HARD", "ADAPTIVE"] as const;
export type DifficultyMode = (typeof DIFFICULTY_MODES)[number];

export const QUESTION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const RESPONSE_MODES = ["VOICE_ONLY", "TEXT_ONLY", "VOICE_AND_TEXT"] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export const INTERVIEWER_PERSONALITIES = [
  "PROFESSIONAL",
  "FRIENDLY",
  "FORMAL",
  "CONVERSATIONAL",
] as const;
export type InterviewerPersonality = (typeof INTERVIEWER_PERSONALITIES)[number];

export const TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const QUESTION_TYPES = [
  "INTRODUCTION",
  "GENERAL",
  "TECHNICAL",
  "BEHAVIORAL",
  "SITUATIONAL",
  "EXPERIENCE",
  "PROBLEM_SOLVING",
  "SYSTEM_DESIGN",
  "CODING",
  "FOLLOW_UP",
  "CLOSING",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_SOURCES = ["FIXED", "AI_GENERATED", "HYBRID"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const CANDIDATE_STAGES = [
  "INVITED",
  "OPENED",
  "STARTED",
  "COMPLETED",
  "UNDER_REVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

/** Stages a recruiter may set manually (the others are driven by the interview lifecycle). */
export const MANUAL_CANDIDATE_STAGES = [
  "UNDER_REVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly CandidateStage[];

export const INVITATION_STATUSES = [
  "PENDING",
  "OPENED",
  "STARTED",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const SESSION_STATUSES = [
  "CREATED",
  "READY",
  "STARTING",
  "AI_SPEAKING",
  "WAITING_FOR_CANDIDATE",
  "CANDIDATE_SPEAKING",
  "PROCESSING_ANSWER",
  "GENERATING_RESPONSE",
  "PAUSED",
  "RECONNECTING",
  "FINISHING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const COMPLETION_REASONS = [
  "NORMAL",
  "TIME_LIMIT",
  "CANDIDATE_ENDED",
  "TECHNICAL_FAILURE",
  "ADMIN_TERMINATED",
  "EXPIRED",
] as const;
export type CompletionReason = (typeof COMPLETION_REASONS)[number];

export const MESSAGE_ROLES = ["SYSTEM_EVENT", "AI", "CANDIDATE"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ANSWER_SOURCES = ["TEXT", "VOICE", "CODE"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const RECOMMENDATIONS = [
  "STRONG_MOVE_FORWARD",
  "MOVE_FORWARD",
  "BORDERLINE",
  "DO_NOT_MOVE_FORWARD",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const EVALUATION_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const INTEGRITY_EVENT_TYPES = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "CONNECTION_LOST",
  "CONNECTION_RESTORED",
  "LONG_RESPONSE_LATENCY",
  "PASTE",
  "COPY",
  "MULTIPLE_SESSIONS",
  "RAPID_RECONNECTS",
  "FULLSCREEN_EXIT",
] as const;
export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

export const CONSENT_TYPES = ["TERMS", "PRIVACY", "AI_INTERVIEW", "RECORDING", "CAMERA"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const RECORDING_KINDS = ["CANDIDATE_AUDIO", "AI_AUDIO", "SESSION_AUDIO", "VIDEO"] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

export const FEEDBACK_ACCURACIES = ["ACCURATE", "PARTIALLY_ACCURATE", "INACCURATE"] as const;
export type FeedbackAccuracy = (typeof FEEDBACK_ACCURACIES)[number];

export const RESUME_PARSE_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type ResumeParseStatus = (typeof RESUME_PARSE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "INTERVIEW_COMPLETED",
  "EVALUATION_READY",
  "INVITATION_EXPIRED",
  "TEAM_INVITE",
  "SYSTEM",
  "SALES_ALERT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Engine actions the interviewer can take on a turn. */
export const INTERVIEW_ACTIONS = [
  "ASK_QUESTION",
  "ASK_FOLLOW_UP",
  "CLARIFY",
  "MOVE_SECTION",
  "ACKNOWLEDGE",
  "END_INTERVIEW",
] as const;
export type InterviewAction = (typeof INTERVIEW_ACTIONS)[number];

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية (Arabic)", dir: "rtl" },
  { code: "fr", label: "Français (French)", dir: "ltr" },
  { code: "es", label: "Español (Spanish)", dir: "ltr" },
] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as unknown as readonly [
  LanguageCode,
  ...LanguageCode[],
];

// ───────────── Platform: subscriptions & agents ─────────────

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const AGENT_TYPES = [
  "INTERVIEWER",
  "SALES",
  "CUSTOMER_SUPPORT",
  "PHONE",
  "EMAIL",
  "DOCUMENT",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_STATUSES = ["SETUP", "ACTIVE", "PAUSED"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const ACTOR_TYPES = ["USER", "CANDIDATE", "SYSTEM", "AI"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// ───────────────────────── AI Sales Agent ─────────────────────────

export const LEAD_STATUSES = [
  "NEW",
  "RESEARCHING",
  "QUALIFIED",
  "UNQUALIFIED",
  "CONTACTED",
  "ENGAGED",
  "INTERESTED",
  "MEETING_REQUESTED",
  "MEETING_BOOKED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ["MANUAL", "CSV_IMPORT", "CRM", "API", "DISCOVERY", "INBOUND"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const RESEARCH_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const SALES_CHANNELS = [
  "EMAIL",
  "LINKEDIN",
  "SMS",
  "WHATSAPP",
  "CALL",
  "MEETING",
  "OTHER",
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const SALES_MESSAGE_STATUSES = [
  "DRAFT",
  "LOGGED",
  "APPROVED",
  "SENT",
  "FAILED",
  "DISCARDED",
] as const;
export type SalesMessageStatus = (typeof SALES_MESSAGE_STATUSES)[number];

export const SUPPRESSION_REASONS = ["UNSUBSCRIBED", "BOUNCED", "COMPLAINT", "MANUAL"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
