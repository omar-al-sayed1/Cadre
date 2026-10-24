import { afterEach, describe, expect, it } from "vitest";
import { setServerEnvForTesting } from "@repo/config/env";
import { db } from "@repo/database";
import type { ActorContext } from "../../context";
import { setSalesAIForTesting } from "../../runtime";
import { addMember, createTestUser } from "../../testing/fixtures";
import { createCompany } from "../company";
import { startProductTrial } from "../subscriptions";
import { updateSalesConfig } from "./agent";
import { addDiscoveredLeads, getDiscoveryRun, requestDiscovery, runDiscovery } from "./discovery";
import { createLead, getLead } from "./leads";

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
    section: "icp",
    data: { industries: ["Real Estate"], countries: ["Lebanon"], companySizes: ["1-10"] },
  });
  return { company, admin };
}

async function completedRun(admin: ActorContext, count = 4) {
  const queued = await requestDiscovery(admin, { industries: ["Real Estate"], count });
  return runDiscovery(queued.id);
}

afterEach(() => {
  setSalesAIForTesting(undefined);
  setServerEnvForTesting(undefined);
});

describe("AI lead discovery", () => {
  it("queues one run at a time and finds candidates for review without creating leads", async () => {
    const { admin } = await workspace();
    const queued = await requestDiscovery(admin, {
      industries: ["Real Estate"],
      countries: ["Lebanon"],
      count: 4,
    });
    expect(queued.status).toBe("QUEUED");
    expect(queued.provider).toBe("demo");
    expect((await requestDiscovery(admin, { count: 5 })).id).toBe(queued.id);
    expect(await db.backgroundJob.count({ where: { name: "sales.discover-leads" } })).toBe(1);

    const done = await runDiscovery(queued.id);
    expect(done.status).toBe("COMPLETED");
    expect(done.candidates).toHaveLength(4);
    expect(done.candidates.every((c) => c.websiteCheck === "sample")).toBe(true);
    expect(done.notes.join(" ")).toMatch(/fictional/i);
    // Approval mode: nothing is added until a person approves.
    expect(await db.salesLead.count({ where: { companyId: admin.companyId } })).toBe(0);
    const notified = await db.notification.findFirst({
      where: { userId: admin.userId, type: "SALES_ALERT" },
    });
    expect(notified?.title).toMatch(/to review/);
  });

  it("flags companies already in the workspace and adds approved ones once", async () => {
    const { admin } = await workspace();
    const first = await completedRun(admin, 3);
    const existingName = first.candidates[0]!.companyName;
    await createLead(admin, { firstName: "Lina", companyName: existingName });

    const result = await addDiscoveredLeads(admin, first.id, {
      candidateIds: first.candidates.map((c) => c.id),
    });
    expect(result).toMatchObject({ added: 2, skipped: 1 });
    const run = await getDiscoveryRun(admin, first.id);
    expect(run.candidates[0]?.duplicateOf?.name).toBe(existingName);
    const added = run.candidates.filter((c) => c.addedLeadId);
    expect(added).toHaveLength(2);
    const lead = await getLead(admin, added[0]!.addedLeadId!);
    expect(lead).toMatchObject({ source: "DISCOVERY", status: expect.any(String) });
    expect(lead.tags).toEqual(["ai-discovered", "demo-sample"]);
    expect(lead.notes).toMatch(/fictional/i);
    expect(
      await db.salesActivity.count({ where: { leadId: lead.id, type: "lead.discovered" } }),
    ).toBe(1);

    // Re-adding is a no-op; a new run excludes and flags existing companies.
    expect(
      await addDiscoveredLeads(admin, first.id, { candidateIds: added.map((c) => c.id) }),
    ).toMatchObject({ added: 0 });
    const second = await completedRun(admin, 3);
    const knownNames = new Set(run.candidates.map((c) => c.companyName));
    expect(second.candidates.some((c) => knownNames.has(c.companyName))).toBe(false);
  });

  it("adds verified companies automatically in autonomous mode", async () => {
    const { admin } = await workspace();
    await updateSalesConfig(admin, { section: "behavior", data: { autonomy: "AUTONOMOUS" } });
    const run = await completedRun(admin, 3);
    expect(run.candidates.every((c) => c.addedLeadId)).toBe(true);
    expect(await db.salesLead.count({ where: { companyId: admin.companyId } })).toBe(3);
    const event = await db.salesActivity.findFirst({ where: { type: "lead.discovered" } });
    expect(event?.summary).toMatch(/autonomous mode/);
  });

  it("is tenant-isolated and permission-checked", async () => {
    const a = await workspace("Org A");
    const b = await workspace("Org B");
    const run = await completedRun(a.admin);
    await expect(getDiscoveryRun(b.admin, run.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addDiscoveredLeads(b.admin, run.id, { candidateIds: ["c1"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const viewer = await addMember(a.company.id, "VIEWER", "viewer@org-a.test");
    await expect(requestDiscovery(viewer, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      addDiscoveredLeads(viewer, run.id, { candidateIds: ["c1"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to run when discovery is turned off", async () => {
    const { admin } = await workspace();
    setServerEnvForTesting({ DISCOVERY_PROVIDER: "off" });
    await expect(requestDiscovery(admin, {})).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
