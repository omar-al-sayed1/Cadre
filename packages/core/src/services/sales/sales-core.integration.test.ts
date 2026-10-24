import { describe, expect, it } from "vitest";
import { db } from "@repo/database";
import type { ActorContext } from "../../context";
import { addMember, createTestUser } from "../../testing/fixtures";
import { createCompany } from "../company";
import { startProductTrial } from "../subscriptions";
import { updateSalesConfig } from "./agent";
import { isSuppressed } from "./automation";
import { getLeadRecommendations } from "./context";
import { changeLeadStatus, createLead, getLead } from "./leads";
import {
  generateOutreachDraft,
  listConversations,
  logMessage,
  markDraftSent,
  updateDraft,
} from "./messaging";
import { getLatestResearch, requestLeadResearch, runLeadResearch } from "./research";

async function workspace(name = "Cedar Web Studio") {
  const slug = name.toLowerCase().replace(/\W+/g, "-");
  const owner = await createTestUser(`owner@${slug}.test`, "Owner");
  const company = await createCompany(
    { id: owner.id, name: owner.name },
    { name, timezone: "Asia/Beirut" },
  );
  const admin: ActorContext = {
    userId: owner.id,
    userName: "Samir",
    companyId: company.id,
    role: "COMPANY_ADMIN",
    platformRole: "USER",
  };
  await startProductTrial(admin, "sales-agent");
  await updateSalesConfig(admin, {
    section: "offering",
    data: {
      name: "Property websites",
      description: "Fast websites for real estate agencies.",
      priceRange: "$1,500–$6,000",
    },
  });
  await updateSalesConfig(admin, {
    section: "icp",
    data: { industries: ["Real Estate"], countries: ["Lebanon"], jobTitles: ["CEO", "Owner"] },
  });
  await updateSalesConfig(admin, {
    section: "playbook",
    data: { forbiddenClaims: ["guaranteed results"] },
  });
  return { company, admin };
}

const RAMI = {
  firstName: "Rami",
  lastName: "Khoury",
  companyName: "Cedar Homes",
  jobTitle: "CEO",
  email: "rami@cedarhomes.example",
  phone: "+961 1 234 567",
  industry: "Real estate",
  city: "Beirut",
  country: "Lebanon",
};

describe("AI Sales Core — research", () => {
  it("researches from the lead record when web research is off, labels facts, and feeds the score", async () => {
    const { admin } = await workspace();
    const lead = await createLead(admin, RAMI);
    const queued = await requestLeadResearch(admin, lead.id);
    expect(queued.status).toBe("QUEUED");
    // Idempotent while running.
    expect((await requestLeadResearch(admin, lead.id)).id).toBe(queued.id);
    const job = await db.backgroundJob.findFirst({ where: { name: "sales.research-lead" } });
    expect(job).not.toBeNull();

    const done = await runLeadResearch(queued.id);
    expect(done.status).toBe("COMPLETED");
    expect(done.provider).toBe("none");
    expect(done.notes.join(" ")).toMatch(/lead record/);
    expect(done.result?.industry).toMatchObject({ basis: "VERIFIED", source: "Lead record" });
    expect(done.result?.personalizationPoints).toEqual([]); // nothing verified beyond the record → nothing invented

    const after = await getLead(admin, lead.id);
    expect(after.problemRelevance).toBe(done.result?.problemRelevance ?? null);
    expect(after.score?.factors.find((f) => f.key === "problemRelevance")?.state).toBe(
      after.problemRelevance === null ? "not_applicable" : "scored",
    );
    // Strong, complete evidence → the AI qualified the NEW lead, and said so on the timeline.
    expect(after.status).toBe("QUALIFIED");
    const aiEvents = await db.salesActivity.findMany({
      where: { leadId: lead.id, actorType: "AI" },
      orderBy: { createdAt: "asc" },
    });
    expect(aiEvents.map((e) => e.type)).toEqual(["ai.researched", "lead.status_changed"]);
    expect((await getLatestResearch(admin, lead.id))?.id).toBe(queued.id);
  });

  it("never lets another workspace research or read a lead", async () => {
    const a = await workspace("Org A");
    const b = await workspace("Org B");
    const lead = await createLead(a.admin, RAMI);
    await expect(requestLeadResearch(b.admin, lead.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getLatestResearch(b.admin, lead.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listConversations(b.admin, lead.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      logMessage(b.admin, lead.id, { direction: "INBOUND", content: "Hi" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("AI Sales Core — outreach drafts", () => {
  it("drafts for review only, flags forbidden claims, and records manual sending honestly", async () => {
    const { admin } = await workspace();
    const lead = await createLead(admin, { ...RAMI });
    const draft = await generateOutreachDraft(admin, lead.id, { type: "COLD_EMAIL" });
    expect(draft).toMatchObject({
      status: "DRAFT",
      direction: "OUTBOUND",
      channel: "EMAIL",
      generatedByAi: true,
    });
    expect(draft.draft?.personalizationSources.every((s) => s.basis === "VERIFIED")).toBe(true);
    expect((await getLead(admin, lead.id)).lastContactedAt).toBeNull(); // nothing was sent

    const edited = await updateDraft(admin, draft.id, {
      content: `${draft.content}\n\nGuaranteed results in a week!`,
    });
    expect(edited.content).toContain("Guaranteed");
    await updateDraft(admin, draft.id, { status: "APPROVED" });
    const sent = await markDraftSent(admin, draft.id);
    expect(sent.status).toBe("LOGGED");
    const after = await getLead(admin, lead.id);
    expect(after.status).toBe("CONTACTED");
    expect(after.lastContactedAt).not.toBeNull();
    const event = await db.salesActivity.findFirst({
      where: { leadId: lead.id, type: "message.marked_sent" },
    });
    expect(event?.summary).toMatch(/outside Cadre/);
    await expect(markDraftSent(admin, draft.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to draft for opted-out or suppressed contacts", async () => {
    const { admin } = await workspace();
    const lead = await createLead(admin, RAMI);
    await changeLeadStatus(admin, lead.id, { status: "DO_NOT_CONTACT" });
    await expect(
      generateOutreachDraft(admin, lead.id, { type: "COLD_EMAIL" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires the Sales AI permission", async () => {
    const { admin, company } = await workspace();
    const lead = await createLead(admin, RAMI);
    const viewer = await addMember(company.id, "VIEWER", "viewer@cedar.test");
    await expect(
      generateOutreachDraft(viewer, lead.id, { type: "COLD_EMAIL" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("AI Sales Core — replies (spec §105)", () => {
  it("“Can you send pricing?” → price request, interested, send information, team notified", async () => {
    const { admin } = await workspace();
    const lead = await createLead(admin, RAMI);
    await changeLeadStatus(admin, lead.id, { status: "QUALIFIED" });
    await logMessage(admin, lead.id, {
      direction: "OUTBOUND",
      content: "Hi Rami, quick idea for Cedar Homes…",
    });
    const { message, applied } = await logMessage(admin, lead.id, {
      direction: "INBOUND",
      content: "Sounds interesting. Can you send pricing?",
    });
    expect(message.analysis?.intent).toBe("PRICE_REQUEST");
    expect(message.analysis?.nextAction.action).toBe("SEND_INFORMATION");
    expect(applied.join(" ")).toMatch(/Moved to interested/);
    const after = await getLead(admin, lead.id);
    expect(after.status).toBe("INTERESTED");
    expect(after.intentScore).toBe(75);
    const recs = await getLeadRecommendations(admin.companyId, after);
    expect(recs[0]).toMatchObject({
      action: "SEND_INFORMATION",
      reason: "The prospect asked about pricing.",
    });
    expect(recs.map((r) => r.action)).not.toContain("FOLLOW_UP"); // no aggressive follow-up
    expect(
      await db.notification.count({ where: { companyId: admin.companyId, type: "SALES_ALERT" } }),
    ).toBeGreaterThan(0);
  });

  it("“Please remove me from your list.” → do not contact, suppressed, drafts discarded", async () => {
    const { admin } = await workspace();
    const lead = await createLead(admin, RAMI);
    await changeLeadStatus(admin, lead.id, { status: "QUALIFIED" });
    const draft = await generateOutreachDraft(admin, lead.id, { type: "FOLLOW_UP" });
    const { message, applied } = await logMessage(admin, lead.id, {
      direction: "INBOUND",
      content: "Please remove me from your list.",
    });
    expect(message.analysis?.intent).toBe("UNSUBSCRIBE");
    expect(applied).toContain("Marked as do not contact");
    const after = await getLead(admin, lead.id);
    expect(after.status).toBe("DO_NOT_CONTACT");
    expect(
      await isSuppressed(admin.companyId, { email: "RAMI@cedarhomes.example", phone: null }),
    ).toBe(true);
    expect((await db.salesMessage.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      "DISCARDED",
    );
    // Even a re-created lead with the same email can't be drafted to.
    await db.salesLead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });
    const again = await createLead(admin, { firstName: "R", email: "rami@cedarhomes.example" });
    await expect(
      generateOutreachDraft(admin, again.id, { type: "COLD_EMAIL" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getLeadRecommendations(admin.companyId, after)).toEqual([
      { action: "STOP_OUTREACH", priority: "high", reason: expect.any(String) },
    ]);
  });

  it("keeps the message even when analysis isn't possible for the user's role", async () => {
    const { admin, company } = await workspace();
    const lead = await createLead(admin, RAMI);
    const rep = await addMember(company.id, "SALES_REP", "rep@cedar.test");
    const { message } = await logMessage(rep, lead.id, {
      direction: "INBOUND",
      content: "Can we schedule a call next Tuesday?",
    });
    expect(message.analysis?.intent).toBe("MEETING_REQUEST"); // reps have sales.ai
    const conversations = await listConversations(admin, lead.id);
    expect(conversations[0]?.messages).toHaveLength(1);
  });
});
