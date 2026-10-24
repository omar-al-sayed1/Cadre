import { describe, expect, it } from "vitest";
import { db } from "@repo/database";
import { hashToken } from "@repo/shared/server";
import { createWorkspace, inviteCandidate } from "../testing/fixtures";
import { beginCandidateSession, getInvitationLanding } from "./candidate-session";
import { cancelInvitation, resendInvitation, resolveInvitationToken } from "./invitations";

const CONSENTS = { terms: true, privacy: true, aiInterview: true } as const;

describe("interview invitations", () => {
  it("stores only a hash of the token and resolves the raw token", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);

    const row = await db.interviewInvitation.findUniqueOrThrow({
      where: { id: invite.invitation.id },
    });
    expect(row.tokenHash).toBe(hashToken(invite.token));
    expect(JSON.stringify(row)).not.toContain(invite.token);

    const resolved = await resolveInvitationToken(invite.token);
    expect(resolved.state).toBe("VALID");
    expect(resolved.invitation.id).toBe(invite.invitation.id);
  });

  it("rejects unknown and malformed tokens", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    const tampered = `${invite.token.slice(0, -2)}xx`;
    await expect(resolveInvitationToken(tampered)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    await expect(resolveInvitationToken("not-a-token")).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
  });

  it("landing page masks the candidate email and exposes no internals", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    const landing = await getInvitationLanding(invite.token);
    expect(landing.candidate.emailHint).not.toBe("omar@example.com");
    expect(landing.candidate.emailHint.endsWith("@example.com")).toBe(true);
    const json = JSON.stringify(landing);
    expect(json).not.toMatch(/idealAnswer|systemPrompt|scoringRubric|tokenHash/i);
  });

  it("cancelled invitations can't be used", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    await cancelInvitation(admin, invite.invitation.id);
    await expect(
      beginCandidateSession(invite.token, { confirmedName: "Omar", consents: CONSENTS }, {}),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("expired invitations can't be used", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    await db.interviewInvitation.update({
      where: { id: invite.invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(
      beginCandidateSession(invite.token, { confirmedName: "Omar", consents: CONSENTS }, {}),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
  });

  it("resending rotates the token: the old link stops working", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    const resent = await resendInvitation(admin, invite.invitation.id, { sendEmail: false });
    const newToken = resent.url.split("/i/")[1]!;
    expect(newToken).not.toBe(invite.token);
    await expect(resolveInvitationToken(invite.token)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    expect((await resolveInvitationToken(newToken)).state).toBe("VALID");
  });

  it("requires every mandatory consent", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    await expect(
      beginCandidateSession(
        invite.token,
        {
          confirmedName: "Omar",
          consents: { terms: true, privacy: true, aiInterview: false as unknown as true },
        },
        {},
      ),
    ).rejects.toThrow();
    expect(await db.interviewSession.count()).toBe(0);
  });

  it("records versioned consent for each accepted policy", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    const begun = await beginCandidateSession(
      invite.token,
      { confirmedName: "Omar Test", consents: CONSENTS },
      { ipHash: "abc" },
    );
    const consents = await db.consentRecord.findMany({ where: { sessionId: begun.sessionId } });
    expect(consents.map((c) => c.consentType).sort()).toEqual(["AI_INTERVIEW", "PRIVACY", "TERMS"]);
    expect(consents.every((c) => c.policyVersion.length > 0)).toBe(true);
  });

  it("does not let another company invite to this company's interview", async () => {
    const nova = await createWorkspace("Nova Technologies");
    const other = await createWorkspace("Other Corp");
    await expect(inviteCandidate(other.admin, nova.template.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
