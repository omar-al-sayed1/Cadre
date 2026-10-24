import { describe, expect, it } from "vitest";
import { recommendNextActions, type RecommendationContext } from "./recommendations";

const now = new Date("2026-10-09T12:00:00Z");
const base: RecommendationContext = {
  status: "NEW",
  hasEmail: true,
  hasPhone: false,
  lastContactedAt: null,
  nextFollowUpAt: null,
  qualification: { status: "QUALIFIED", reason: "Fit score 90 meets your 60+ bar." },
  dataConfidence: 1,
  research: "completed",
  lastInbound: null,
  lastOutboundAt: null,
  now,
};
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
const actions = (ctx: Partial<RecommendationContext>) =>
  recommendNextActions({ ...base, ...ctx }).map((r) => r.action);

describe("next-best actions (spec §29)", () => {
  it("opt-outs override everything", () => {
    expect(actions({ status: "DO_NOT_CONTACT" })).toEqual(["STOP_OUTREACH"]);
    expect(
      actions({
        lastInbound: {
          at: days(0),
          intent: "UNSUBSCRIBE",
          escalate: false,
          requestedInformation: [],
          objections: [],
        },
      }),
    ).toEqual(["STOP_OUTREACH"]);
  });

  it("answers what the prospect asked for", () => {
    const price = recommendNextActions({
      ...base,
      status: "ENGAGED",
      lastInbound: {
        at: days(0),
        intent: "PRICE_REQUEST",
        escalate: false,
        requestedInformation: ["Pricing"],
        objections: [],
      },
    });
    expect(price[0]).toMatchObject({
      action: "SEND_INFORMATION",
      reason: "The prospect asked about pricing.",
    });
    expect(
      actions({
        status: "INTERESTED",
        lastInbound: {
          at: days(0),
          intent: "MEETING_REQUEST",
          escalate: false,
          requestedInformation: [],
          objections: [],
        },
      }),
    ).toEqual(["SCHEDULE_CALL"]);
    expect(
      actions({
        status: "ENGAGED",
        lastInbound: {
          at: days(0),
          intent: "QUESTION",
          escalate: true,
          requestedInformation: [],
          objections: [],
        },
      })[0],
    ).toBe("ESCALATE_TO_HUMAN");
  });

  it("ignores replies we've already answered", () => {
    expect(
      actions({
        status: "CONTACTED",
        lastContactedAt: days(1),
        lastOutboundAt: days(1),
        lastInbound: {
          at: days(2),
          intent: "QUESTION",
          escalate: false,
          requestedInformation: [],
          objections: [],
        },
      }),
    ).toEqual(["WAIT"]);
  });

  it("researches before outreach when fit is uncertain, and flags non-fits", () => {
    expect(
      actions({
        research: "none",
        qualification: { status: "NEEDS_REVIEW", reason: "Industry unknown." },
        dataConfidence: 0.4,
      }),
    ).toContain("RESEARCH_LEAD");
    expect(actions({ qualification: { status: "UNQUALIFIED", reason: "Restaurant" } })).toContain(
      "DISQUALIFY",
    );
    expect(actions({})).toEqual(["QUALIFY", "CONTACT"]);
    expect(actions({ hasEmail: false })).toEqual(["ADD_DETAILS"]);
  });

  it("follows up on silence, without nagging", () => {
    expect(actions({ status: "CONTACTED", lastContactedAt: days(4) })).toEqual(["FOLLOW_UP"]);
    expect(actions({ status: "CONTACTED", lastContactedAt: days(1) })).toEqual(["WAIT"]);
    expect(
      recommendNextActions({ ...base, status: "CONTACTED", lastContactedAt: days(9) })[0]!.priority,
    ).toBe("high");
    expect(
      actions({
        status: "CONTACTED",
        lastContactedAt: days(9),
        nextFollowUpAt: new Date(now.getTime() + 86_400_000),
      }),
    ).toEqual(["WAIT"]);
  });

  it("hands pricing and contracts to people", () => {
    expect(actions({ status: "NEGOTIATION" })).toEqual(["ESCALATE_TO_HUMAN"]);
  });
});
