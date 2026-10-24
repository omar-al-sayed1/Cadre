import type { LeadSource, LeadStatus } from "@repo/shared";

/** Display labels and badge tones for lead statuses (UI and summaries share these). */
export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; tone: "muted" | "info" | "success" | "warning" | "danger" | "default" }
> = {
  NEW: { label: "New", tone: "muted" },
  RESEARCHING: { label: "Researching", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "success" },
  UNQUALIFIED: { label: "Unqualified", tone: "muted" },
  CONTACTED: { label: "Contacted", tone: "info" },
  ENGAGED: { label: "Engaged", tone: "info" },
  INTERESTED: { label: "Interested", tone: "success" },
  MEETING_REQUESTED: { label: "Meeting requested", tone: "warning" },
  MEETING_BOOKED: { label: "Meeting booked", tone: "success" },
  PROPOSAL: { label: "Proposal", tone: "default" },
  NEGOTIATION: { label: "Negotiation", tone: "default" },
  WON: { label: "Won", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
  DO_NOT_CONTACT: { label: "Do not contact", tone: "danger" },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL: "Manual",
  CSV_IMPORT: "CSV import",
  CRM: "CRM",
  API: "API",
  DISCOVERY: "Prospect discovery",
  INBOUND: "Inbound",
};
