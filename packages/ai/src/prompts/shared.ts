import type { InterviewerPersonality } from "@repo/shared";
import type { InterviewerContext, JobContext } from "../service/types";
import { dataBlock } from "./safety";

export const SCORE_SCALE_TEXT = [
  "0–20: no demonstrated knowledge",
  "21–40: limited",
  "41–60: basic / junior",
  "61–75: competent",
  "76–90: strong",
  "91–100: exceptional",
].join("; ");

export const PERSONALITY_GUIDANCE: Record<InterviewerPersonality, string> = {
  PROFESSIONAL: "courteous, composed and efficient",
  FRIENDLY: "warm and encouraging, while staying neutral about the quality of answers",
  FORMAL: "polite and formal; avoid casual phrasing and contractions",
  CONVERSATIONAL: "relaxed and natural, like a thoughtful senior colleague",
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function renderSkillRubric(job: JobContext): string {
  if (job.skills.length === 0) return "No specific skills configured; assess general role fit.";
  return job.skills
    .map(
      (s) =>
        `- ${s.name} (key: ${s.key}) — weight ${s.weight}%, expected level ${s.expectedLevel}${s.critical ? ", CRITICAL" : ""}`,
    )
    .join("\n");
}

/** Recruiter/role configuration. Trusted structure; free-text fields still go in data blocks. */
export function renderRoleConfiguration(
  job: JobContext,
  interviewer: InterviewerContext | null,
): string {
  const lines = [
    `Company: ${job.companyName}`,
    `Role: ${job.title} (seniority: ${job.experienceLevel})`,
  ];
  if (interviewer) {
    lines.push(
      `Interviewer name: ${interviewer.name}`,
      `Tone: ${interviewer.personality} — ${PERSONALITY_GUIDANCE[interviewer.personality]}. Tone never changes evaluation standards.`,
      `Interview language: ${languageName(interviewer.language)} (${interviewer.language})`,
      `Interview type: ${interviewer.interviewType}; planned duration ${interviewer.durationMinutes} minutes`,
    );
  }
  lines.push("Rubric skills:", renderSkillRubric(job));
  return lines.join("\n");
}

export function renderJobData(job: JobContext): string {
  const parts = [
    job.description && `Description:\n${job.description}`,
    job.responsibilities && `Responsibilities:\n${job.responsibilities}`,
    job.requirements && `Requirements:\n${job.requirements}`,
  ].filter(Boolean);
  return dataBlock("job_posting", parts.join("\n\n") || "(no description provided)", 6_000);
}

export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
