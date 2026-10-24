-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('COMPANY_ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'REVIEWER');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('SIZE_1_10', 'SIZE_11_50', 'SIZE_51_200', 'SIZE_201_1000', 'SIZE_1000_PLUS');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('TECHNICAL', 'DOMAIN', 'SOFT', 'LANGUAGE', 'TOOL');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('SCREENING', 'TECHNICAL', 'BEHAVIORAL', 'HR', 'MIXED');

-- CreateEnum
CREATE TYPE "DifficultyMode" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'ADAPTIVE');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ResponseMode" AS ENUM ('VOICE_ONLY', 'TEXT_ONLY', 'VOICE_AND_TEXT');

-- CreateEnum
CREATE TYPE "InterviewerPersonality" AS ENUM ('PROFESSIONAL', 'FRIENDLY', 'FORMAL', 'CONVERSATIONAL');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('INTRODUCTION', 'GENERAL', 'TECHNICAL', 'BEHAVIORAL', 'SITUATIONAL', 'EXPERIENCE', 'PROBLEM_SOLVING', 'SYSTEM_DESIGN', 'CODING', 'FOLLOW_UP', 'CLOSING');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('FIXED', 'AI_GENERATED', 'HYBRID');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('INVITED', 'OPENED', 'STARTED', 'COMPLETED', 'UNDER_REVIEW', 'SHORTLISTED', 'OFFER', 'HIRED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'OPENED', 'STARTED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'READY', 'STARTING', 'AI_SPEAKING', 'WAITING_FOR_CANDIDATE', 'CANDIDATE_SPEAKING', 'PROCESSING_ANSWER', 'GENERATING_RESPONSE', 'PAUSED', 'RECONNECTING', 'FINISHING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CompletionReason" AS ENUM ('NORMAL', 'TIME_LIMIT', 'CANDIDATE_ENDED', 'TECHNICAL_FAILURE', 'ADMIN_TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM_EVENT', 'AI', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "AnswerSource" AS ENUM ('TEXT', 'VOICE', 'CODE');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('STRONG_MOVE_FORWARD', 'MOVE_FORWARD', 'BORDERLINE', 'DO_NOT_MOVE_FORWARD', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvaluationPhase" AS ENUM ('INTERIM', 'FINAL');

-- CreateEnum
CREATE TYPE "IntegrityEventType" AS ENUM ('TAB_HIDDEN', 'WINDOW_BLUR', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'LONG_RESPONSE_LATENCY', 'PASTE', 'COPY', 'MULTIPLE_SESSIONS', 'RAPID_RECONNECTS', 'FULLSCREEN_EXIT');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'AI_INTERVIEW', 'RECORDING', 'CAMERA');

-- CreateEnum
CREATE TYPE "RecordingKind" AS ENUM ('CANDIDATE_AUDIO', 'AI_AUDIO', 'SESSION_AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "FeedbackAccuracy" AS ENUM ('ACCURATE', 'PARTIALLY_ACCURATE', 'INACCURATE');

-- CreateEnum
CREATE TYPE "ResumeParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INTERVIEW_COMPLETED', 'EVALUATION_READY', 'INVITATION_EXPIRED', 'TEAM_INVITE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiOperation" AS ENUM ('GENERATE_INTERVIEW', 'NEXT_ACTION', 'EVALUATE_ANSWER', 'EVALUATE_INTERVIEW', 'PARSE_RESUME', 'SUMMARIZE_MEMORY', 'SPEECH_TO_TEXT', 'TEXT_TO_SPEECH');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CANDIDATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "activeCompanyId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyInterviewLimit" INTEGER,
    "monthlyAiBudgetUsd" DOUBLE PRECISION,
    "seats" INTEGER,
    "priceMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoKey" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "size" "CompanySize",
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "primaryColor" TEXT,
    "welcomeText" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "planId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_member" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,
    "invitedById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL DEFAULT 'TECHNICAL',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "workMode" "WorkMode" NOT NULL DEFAULT 'REMOTE',
    "description" TEXT NOT NULL DEFAULT '',
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "requirements" TEXT NOT NULL DEFAULT '',
    "preferredQualifications" TEXT NOT NULL DEFAULT '',
    "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'MID',
    "minExperienceYears" INTEGER,
    "maxExperienceYears" INTEGER,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skill" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "expectedLevel" "SkillLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_template" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "InterviewType" NOT NULL DEFAULT 'MIXED',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "minQuestions" INTEGER NOT NULL DEFAULT 5,
    "maxQuestions" INTEGER NOT NULL DEFAULT 15,
    "difficulty" "DifficultyMode" NOT NULL DEFAULT 'ADAPTIVE',
    "language" TEXT NOT NULL DEFAULT 'en',
    "responseMode" "ResponseMode" NOT NULL DEFAULT 'VOICE_AND_TEXT',
    "personality" "InterviewerPersonality" NOT NULL DEFAULT 'PROFESSIONAL',
    "interviewerName" TEXT,
    "voice" TEXT,
    "aiSettings" JSONB NOT NULL DEFAULT '{}',
    "scoringConfig" JSONB NOT NULL DEFAULT '{}',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT true,
    "generatedByAi" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_template_version" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_template_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_section" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "targetDurationMinutes" INTEGER NOT NULL DEFAULT 5,
    "minQuestions" INTEGER NOT NULL DEFAULT 1,
    "maxQuestions" INTEGER NOT NULL DEFAULT 4,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "focusSkillIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_question" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TECHNICAL',
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "skillId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "expectedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idealAnswer" TEXT,
    "redFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpGuidance" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "source" "QuestionSource" NOT NULL DEFAULT 'FIXED',
    "order" INTEGER NOT NULL DEFAULT 0,
    "bankItemId" TEXT,
    "codingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_item" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TECHNICAL',
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "skillId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "expectedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idealAnswer" TEXT,
    "redFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpGuidance" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "location" TEXT,
    "source" TEXT,
    "createdById" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_resume" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parseStatus" "ResumeParseStatus" NOT NULL DEFAULT 'PENDING',
    "parsedData" JSONB,
    "parseError" TEXT,
    "promptVersion" TEXT,
    "parsedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "CandidateStage" NOT NULL DEFAULT 'INVITED',
    "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_invitation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_session" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "credentialHash" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "responseMode" "ResponseMode" NOT NULL DEFAULT 'VOICE_AND_TEXT',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "engineState" JSONB NOT NULL DEFAULT '{}',
    "currentSectionKey" TEXT,
    "currentQuestionKey" TEXT,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "followUpsAsked" INTEGER NOT NULL DEFAULT 0,
    "turnLockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "reconnectCount" INTEGER NOT NULL DEFAULT 0,
    "completionReason" "CompletionReason",
    "failureReason" TEXT,
    "promptVersion" TEXT,
    "scoringVersion" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "clientMessageId" TEXT,
    "action" TEXT,
    "questionKey" TEXT,
    "sectionKey" TEXT,
    "audioStorageKey" TEXT,
    "durationMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_answer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "questionMessageId" TEXT,
    "questionKey" TEXT,
    "questionText" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'GENERAL',
    "sectionKey" TEXT,
    "skillKey" TEXT,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpDepth" INTEGER NOT NULL DEFAULT 0,
    "threadKey" TEXT NOT NULL,
    "source" "AnswerSource" NOT NULL DEFAULT 'TEXT',
    "responseLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_evaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "answerId" TEXT,
    "phase" "EvaluationPhase" NOT NULL,
    "threadKey" TEXT NOT NULL,
    "questionKey" TEXT,
    "questionText" TEXT NOT NULL,
    "skillKey" TEXT,
    "difficulty" "QuestionDifficulty",
    "score" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "answerSummary" TEXT NOT NULL DEFAULT '',
    "assessment" TEXT NOT NULL DEFAULT '',
    "demonstratedConcepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingConcepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incorrectClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needsFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "star" JSONB,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" INTEGER,
    "recommendation" "Recommendation",
    "recommendationConfidence" DOUBLE PRECISION,
    "confidenceLevel" "ConfidenceLevel",
    "summary" TEXT,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "concerns" JSONB NOT NULL DEFAULT '[]',
    "communication" JSONB NOT NULL DEFAULT '{}',
    "behavioral" JSONB NOT NULL DEFAULT '{}',
    "followUpTopics" JSONB NOT NULL DEFAULT '[]',
    "resumeAlignment" JSONB NOT NULL DEFAULT '{}',
    "categoryScores" JSONB NOT NULL DEFAULT '{}',
    "modelRecommendation" "Recommendation",
    "templateVersion" INTEGER,
    "promptVersion" TEXT,
    "scoringVersion" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "generatedAt" TIMESTAMP(3),
    "overriddenScore" INTEGER,
    "overriddenRecommendation" "Recommendation",
    "overrideReason" TEXT,
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_evaluation" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "skillId" TEXT,
    "skillKey" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "expectedLevel" "SkillLevel",
    "score" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceLevel" "ConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" "RecordingKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "offsetMs" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_event" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "IntegrityEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "integrity_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "consentType" "ConsentType" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_feedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_note" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "sessionId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_feedback" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accuracy" "FeedbackAccuracy" NOT NULL,
    "correction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_request" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT,
    "requestedById" TEXT,
    "scope" JSONB NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_deletion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_job" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "uniqueKey" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "sessionId" TEXT,
    "operation" "AiOperation" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" DOUBLE PRECISION,
    "characters" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_override" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE INDEX "auth_session_userId_idx" ON "auth_session"("userId");

-- CreateIndex
CREATE INDEX "auth_account_userId_idx" ON "auth_account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_key" ON "plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

-- CreateIndex
CREATE INDEX "company_member_userId_idx" ON "company_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_member_companyId_userId_key" ON "company_member"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitation_tokenHash_key" ON "team_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invitation_companyId_email_idx" ON "team_invitation"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "skill_companyId_slug_key" ON "skill"("companyId", "slug");

-- CreateIndex
CREATE INDEX "job_companyId_status_idx" ON "job"("companyId", "status");

-- CreateIndex
CREATE INDEX "job_companyId_createdAt_idx" ON "job"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_skill_jobId_skillId_key" ON "job_skill"("jobId", "skillId");

-- CreateIndex
CREATE INDEX "interview_template_companyId_jobId_idx" ON "interview_template"("companyId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_template_version_templateId_version_key" ON "interview_template_version"("templateId", "version");

-- CreateIndex
CREATE INDEX "interview_section_templateId_order_idx" ON "interview_section"("templateId", "order");

-- CreateIndex
CREATE INDEX "interview_question_templateId_sectionId_order_idx" ON "interview_question"("templateId", "sectionId", "order");

-- CreateIndex
CREATE INDEX "question_bank_item_companyId_type_idx" ON "question_bank_item"("companyId", "type");

-- CreateIndex
CREATE INDEX "question_bank_item_tags_idx" ON "question_bank_item" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "candidate_companyId_createdAt_idx" ON "candidate"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_companyId_lastName_firstName_idx" ON "candidate"("companyId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_companyId_email_key" ON "candidate"("companyId", "email");

-- CreateIndex
CREATE INDEX "candidate_resume_candidateId_createdAt_idx" ON "candidate_resume"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "application_jobId_stage_idx" ON "application"("jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "application_candidateId_jobId_key" ON "application"("candidateId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_invitation_tokenHash_key" ON "interview_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "interview_invitation_candidateId_idx" ON "interview_invitation"("candidateId");

-- CreateIndex
CREATE INDEX "interview_invitation_status_expiresAt_idx" ON "interview_invitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "interview_session_companyId_status_idx" ON "interview_session"("companyId", "status");

-- CreateIndex
CREATE INDEX "interview_session_companyId_createdAt_idx" ON "interview_session"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "interview_session_invitationId_idx" ON "interview_session"("invitationId");

-- CreateIndex
CREATE INDEX "interview_session_candidateId_idx" ON "interview_session"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_message_sessionId_sequenceNumber_key" ON "interview_message"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "interview_message_sessionId_clientMessageId_key" ON "interview_message"("sessionId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_answer_messageId_key" ON "candidate_answer"("messageId");

-- CreateIndex
CREATE INDEX "candidate_answer_sessionId_threadKey_idx" ON "candidate_answer"("sessionId", "threadKey");

-- CreateIndex
CREATE INDEX "question_evaluation_sessionId_phase_idx" ON "question_evaluation"("sessionId", "phase");

-- CreateIndex
CREATE INDEX "question_evaluation_evaluationId_idx" ON "question_evaluation"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluation_sessionId_key" ON "interview_evaluation"("sessionId");

-- CreateIndex
CREATE INDEX "interview_evaluation_status_idx" ON "interview_evaluation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "skill_evaluation_evaluationId_skillKey_key" ON "skill_evaluation"("evaluationId", "skillKey");

-- CreateIndex
CREATE INDEX "recording_sessionId_idx" ON "recording"("sessionId");

-- CreateIndex
CREATE INDEX "integrity_event_sessionId_type_idx" ON "integrity_event"("sessionId", "type");

-- CreateIndex
CREATE INDEX "consent_record_candidateId_idx" ON "consent_record"("candidateId");

-- CreateIndex
CREATE INDEX "consent_record_invitationId_idx" ON "consent_record"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_feedback_sessionId_key" ON "candidate_feedback"("sessionId");

-- CreateIndex
CREATE INDEX "recruiter_note_candidateId_createdAt_idx" ON "recruiter_note"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_feedback_evaluationId_userId_key" ON "evaluation_feedback"("evaluationId", "userId");

-- CreateIndex
CREATE INDEX "audit_log_companyId_createdAt_idx" ON "audit_log"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupeKey_key" ON "notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "data_deletion_request_companyId_status_idx" ON "data_deletion_request"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "background_job_uniqueKey_key" ON "background_job"("uniqueKey");

-- CreateIndex
CREATE INDEX "background_job_status_runAt_idx" ON "background_job"("status", "runAt");

-- CreateIndex
CREATE INDEX "background_job_name_status_idx" ON "background_job"("name", "status");

-- CreateIndex
CREATE INDEX "ai_usage_event_companyId_createdAt_idx" ON "ai_usage_event"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_sessionId_idx" ON "ai_usage_event"("sessionId");

-- CreateIndex
CREATE INDEX "ai_usage_event_operation_createdAt_idx" ON "ai_usage_event"("operation", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_override_flagId_companyId_key" ON "feature_flag_override"("flagId", "companyId");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expiresAt_idx" ON "rate_limit_bucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill" ADD CONSTRAINT "skill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_template" ADD CONSTRAINT "interview_template_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_template" ADD CONSTRAINT "interview_template_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_template" ADD CONSTRAINT "interview_template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_template_version" ADD CONSTRAINT "interview_template_version_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interview_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_section" ADD CONSTRAINT "interview_section_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interview_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interview_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "interview_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "question_bank_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_resume" ADD CONSTRAINT "candidate_resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_invitation" ADD CONSTRAINT "interview_invitation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_invitation" ADD CONSTRAINT "interview_invitation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_invitation" ADD CONSTRAINT "interview_invitation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interview_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_invitation" ADD CONSTRAINT "interview_invitation_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "interview_template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_invitation" ADD CONSTRAINT "interview_invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "interview_invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "interview_template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_message" ADD CONSTRAINT "interview_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_answer" ADD CONSTRAINT "candidate_answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_answer" ADD CONSTRAINT "candidate_answer_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "interview_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_evaluation" ADD CONSTRAINT "question_evaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_evaluation" ADD CONSTRAINT "question_evaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "interview_evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_evaluation" ADD CONSTRAINT "question_evaluation_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "candidate_answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluation" ADD CONSTRAINT "interview_evaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evaluation" ADD CONSTRAINT "skill_evaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "interview_evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "interview_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_event" ADD CONSTRAINT "integrity_event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "interview_invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_feedback" ADD CONSTRAINT "candidate_feedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_note" ADD CONSTRAINT "recruiter_note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_note" ADD CONSTRAINT "recruiter_note_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_note" ADD CONSTRAINT "recruiter_note_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_note" ADD CONSTRAINT "recruiter_note_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_note" ADD CONSTRAINT "recruiter_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_feedback" ADD CONSTRAINT "evaluation_feedback_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "interview_evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_feedback" ADD CONSTRAINT "evaluation_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_request" ADD CONSTRAINT "data_deletion_request_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_override" ADD CONSTRAINT "feature_flag_override_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "feature_flag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_override" ADD CONSTRAINT "feature_flag_override_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
