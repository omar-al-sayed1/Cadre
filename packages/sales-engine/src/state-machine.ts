import type { LeadStatus } from "@repo/shared";

/**
 * Lead lifecycle (spec §48). Every status change is validated here.
 *
 * - Humans may move a lead along any transition listed in HUMAN_TRANSITIONS
 *   (including corrections such as QUALIFIED → UNQUALIFIED).
 * - The AI may only make forward moves listed in AI_TRANSITIONS. It can never
 *   set PROPOSAL, NEGOTIATION, WON or LOST, and never reverses a human decision.
 * - DO_NOT_CONTACT is terminal: opting out can't be undone by the product.
 *   Any actor (including the AI) can move a lead *into* it so opt-outs are
 *   always honoured.
 */
export const HUMAN_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["RESEARCHING", "QUALIFIED", "UNQUALIFIED", "CONTACTED", "LOST", "DO_NOT_CONTACT"],
  RESEARCHING: ["NEW", "QUALIFIED", "UNQUALIFIED", "DO_NOT_CONTACT"],
  QUALIFIED: ["UNQUALIFIED", "CONTACTED", "LOST", "DO_NOT_CONTACT"],
  UNQUALIFIED: ["QUALIFIED", "RESEARCHING", "LOST", "DO_NOT_CONTACT"],
  CONTACTED: [
    "ENGAGED",
    "INTERESTED",
    "MEETING_REQUESTED",
    "MEETING_BOOKED",
    "LOST",
    "DO_NOT_CONTACT",
  ],
  ENGAGED: ["INTERESTED", "MEETING_REQUESTED", "MEETING_BOOKED", "LOST", "DO_NOT_CONTACT"],
  INTERESTED: [
    "ENGAGED",
    "MEETING_REQUESTED",
    "MEETING_BOOKED",
    "PROPOSAL",
    "LOST",
    "DO_NOT_CONTACT",
  ],
  MEETING_REQUESTED: ["INTERESTED", "MEETING_BOOKED", "LOST", "DO_NOT_CONTACT"],
  MEETING_BOOKED: ["INTERESTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "DO_NOT_CONTACT"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST", "DO_NOT_CONTACT"],
  NEGOTIATION: ["PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT"],
  WON: ["NEGOTIATION"],
  LOST: ["QUALIFIED", "CONTACTED", "DO_NOT_CONTACT"],
  DO_NOT_CONTACT: [],
};

export const AI_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["RESEARCHING", "QUALIFIED", "UNQUALIFIED", "DO_NOT_CONTACT"],
  RESEARCHING: ["QUALIFIED", "UNQUALIFIED", "DO_NOT_CONTACT"],
  QUALIFIED: ["CONTACTED", "DO_NOT_CONTACT"],
  UNQUALIFIED: ["DO_NOT_CONTACT"],
  CONTACTED: ["ENGAGED", "INTERESTED", "MEETING_REQUESTED", "DO_NOT_CONTACT"],
  ENGAGED: ["INTERESTED", "MEETING_REQUESTED", "DO_NOT_CONTACT"],
  INTERESTED: ["MEETING_REQUESTED", "DO_NOT_CONTACT"],
  MEETING_REQUESTED: ["MEETING_BOOKED", "DO_NOT_CONTACT"],
  MEETING_BOOKED: ["DO_NOT_CONTACT"],
  PROPOSAL: ["DO_NOT_CONTACT"],
  NEGOTIATION: ["DO_NOT_CONTACT"],
  WON: [],
  LOST: ["DO_NOT_CONTACT"],
  DO_NOT_CONTACT: [],
};

export type LeadActor = "USER" | "AI" | "SYSTEM";

export function canTransitionLead(from: LeadStatus, to: LeadStatus, actor: LeadActor): boolean {
  if (from === to) return false;
  const table = actor === "USER" ? HUMAN_TRANSITIONS : AI_TRANSITIONS;
  return table[from].includes(to);
}

export function allowedLeadTransitions(from: LeadStatus, actor: LeadActor): readonly LeadStatus[] {
  return (actor === "USER" ? HUMAN_TRANSITIONS : AI_TRANSITIONS)[from];
}

export class InvalidLeadTransitionError extends Error {
  constructor(
    readonly from: LeadStatus,
    readonly to: LeadStatus,
    readonly actor: LeadActor,
  ) {
    super(`Lead can't move from ${from} to ${to} (${actor.toLowerCase()})`);
    this.name = "InvalidLeadTransitionError";
  }
}

export function assertLeadTransition(from: LeadStatus, to: LeadStatus, actor: LeadActor): void {
  if (!canTransitionLead(from, to, actor)) throw new InvalidLeadTransitionError(from, to, actor);
}

/** Leads that must never be contacted again (outreach is blocked). */
export function isContactable(status: LeadStatus): boolean {
  return (
    status !== "DO_NOT_CONTACT" && status !== "WON" && status !== "LOST" && status !== "UNQUALIFIED"
  );
}

/** Pipeline grouping used by dashboards. */
export const STATUS_GROUPS = {
  new: ["NEW", "RESEARCHING"],
  qualified: ["QUALIFIED"],
  contacted: ["CONTACTED", "ENGAGED"],
  interested: ["INTERESTED", "MEETING_REQUESTED"],
  meetings: ["MEETING_BOOKED"],
  pipeline: ["PROPOSAL", "NEGOTIATION"],
  won: ["WON"],
  closed: ["LOST", "UNQUALIFIED", "DO_NOT_CONTACT"],
} as const satisfies Record<string, readonly LeadStatus[]>;

/** Statuses at or beyond "qualified" in the funnel (for conversion metrics). */
export const QUALIFIED_OR_LATER: readonly LeadStatus[] = [
  "QUALIFIED",
  "CONTACTED",
  "ENGAGED",
  "INTERESTED",
  "MEETING_REQUESTED",
  "MEETING_BOOKED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];

export const CONTACTED_OR_LATER: readonly LeadStatus[] = [
  "CONTACTED",
  "ENGAGED",
  "INTERESTED",
  "MEETING_REQUESTED",
  "MEETING_BOOKED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];

export const INTERESTED_OR_LATER: readonly LeadStatus[] = [
  "INTERESTED",
  "MEETING_REQUESTED",
  "MEETING_BOOKED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];

export const MEETING_OR_LATER: readonly LeadStatus[] = [
  "MEETING_BOOKED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];
