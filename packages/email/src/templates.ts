import { brand } from "@repo/config";
import { renderLayout } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const formatDate = (date: Date, timezone = "UTC") =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);

export interface InvitationEmailData {
  candidateFirstName: string;
  jobTitle: string;
  companyName: string;
  durationMinutes: number;
  expiresAt: Date;
  interviewUrl: string;
  timezone?: string;
  brandColor?: string | null;
  welcomeText?: string | null;
}

export function invitationEmail(d: InvitationEmailData): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `Your interview for ${d.jobTitle} at ${d.companyName}`,
    heading: `Interview invitation — ${d.jobTitle}`,
    paragraphs: [
      `Hello ${d.candidateFirstName},`,
      `You have been invited to complete an AI-assisted interview for the ${d.jobTitle} position at ${d.companyName}.`,
      ...(d.welcomeText ? [d.welcomeText] : []),
      "The interview is conducted by an AI interviewer and can be completed by voice or text, whenever it suits you before the deadline. A quiet place and a working microphone are recommended.",
    ],
    details: [
      { label: "Estimated duration", value: `${d.durationMinutes} minutes` },
      { label: "Complete before", value: formatDate(d.expiresAt, d.timezone) },
    ],
    cta: { label: "Start Interview", url: d.interviewUrl },
    footerNote: `This link is personal to you — please don't share it. Your responses will be reviewed by the ${d.companyName} hiring team.`,
    brandColor: d.brandColor ?? undefined,
    companyName: d.companyName,
  });
  return { subject: `Interview Invitation — ${d.jobTitle}`, html, text };
}

export function reminderEmail(d: InvitationEmailData & { hoursLeft: number }): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `Reminder: your interview for ${d.jobTitle} closes soon`,
    heading: `Reminder: your interview closes soon`,
    paragraphs: [
      `Hello ${d.candidateFirstName},`,
      `This is a friendly reminder that your AI-assisted interview for the ${d.jobTitle} position at ${d.companyName} is still open. It closes in about ${d.hoursLeft} hours.`,
    ],
    details: [
      { label: "Estimated duration", value: `${d.durationMinutes} minutes` },
      { label: "Complete before", value: formatDate(d.expiresAt, d.timezone) },
    ],
    cta: { label: "Start Interview", url: d.interviewUrl },
    brandColor: d.brandColor ?? undefined,
    companyName: d.companyName,
  });
  return { subject: `Reminder: Interview for ${d.jobTitle}`, html, text };
}

export function candidateCompletedEmail(d: {
  candidateFirstName: string;
  jobTitle: string;
  companyName: string;
  brandColor?: string | null;
}): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: "Thank you for completing your interview",
    heading: "Thank you for completing your interview",
    paragraphs: [
      `Hello ${d.candidateFirstName},`,
      `Thank you for completing your interview for the ${d.jobTitle} position at ${d.companyName}. Your responses have been recorded and will be reviewed by the hiring team, who will be in touch about next steps.`,
    ],
    brandColor: d.brandColor ?? undefined,
    companyName: d.companyName,
  });
  return { subject: `Interview completed — ${d.jobTitle}`, html, text };
}

export function invitationExpiredEmail(d: {
  candidateFirstName: string;
  jobTitle: string;
  companyName: string;
}): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `Your interview invitation for ${d.jobTitle} has expired`,
    heading: "Your interview invitation has expired",
    paragraphs: [
      `Hello ${d.candidateFirstName},`,
      `Your interview invitation for the ${d.jobTitle} position at ${d.companyName} has expired. If you're still interested, please contact the recruiter, who can send you a new link.`,
    ],
    companyName: d.companyName,
  });
  return { subject: `Interview invitation expired — ${d.jobTitle}`, html, text };
}

export function recruiterCompletedEmail(d: {
  recruiterName: string;
  candidateName: string;
  jobTitle: string;
  reportUrl: string;
  companyName: string;
}): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `${d.candidateName} completed their interview`,
    heading: `${d.candidateName} completed their interview`,
    paragraphs: [
      `Hi ${d.recruiterName},`,
      `${d.candidateName} has completed the AI interview for ${d.jobTitle}. The AI-generated evaluation will be available shortly. Review the evidence before making any employment decision.`,
    ],
    cta: { label: "Review results", url: d.reportUrl },
    companyName: d.companyName,
    footerNote: `You're receiving this because you're a member of ${d.companyName} on ${brand.productName}.`,
  });
  return { subject: `Interview completed: ${d.candidateName} — ${d.jobTitle}`, html, text };
}

export function verifyEmail(d: { name: string; url: string }): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `Verify your email for ${brand.productName}`,
    heading: "Verify your email address",
    paragraphs: [
      `Hi ${d.name},`,
      `Confirm your email address to finish setting up your ${brand.productName} account.`,
    ],
    cta: { label: "Verify email", url: d.url },
    footerNote: "If you didn't create an account, you can ignore this email.",
  });
  return { subject: `Verify your email — ${brand.productName}`, html, text };
}

export function resetPasswordEmail(d: { name: string; url: string }): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: "Reset your password",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${d.name},`,
      "We received a request to reset your password. This link expires in one hour.",
    ],
    cta: { label: "Reset password", url: d.url },
    footerNote: "If you didn't request a password reset, you can safely ignore this email.",
  });
  return { subject: `Reset your password — ${brand.productName}`, html, text };
}

export function teamInviteEmail(d: {
  inviterName: string;
  companyName: string;
  role: string;
  url: string;
}): RenderedEmail {
  const { html, text } = renderLayout({
    preheader: `${d.inviterName} invited you to ${d.companyName}`,
    heading: `Join ${d.companyName} on ${brand.productName}`,
    paragraphs: [
      `${d.inviterName} invited you to join ${d.companyName} as ${d.role.replace(/_/g, " ").toLowerCase()}.`,
    ],
    cta: { label: "Accept invitation", url: d.url },
    companyName: d.companyName,
  });
  return { subject: `You're invited to ${d.companyName}`, html, text };
}
