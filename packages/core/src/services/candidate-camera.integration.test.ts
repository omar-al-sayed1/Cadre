import { describe, expect, it } from "vitest";
import { db } from "@repo/database";
import { createWorkspace, inviteCandidate } from "../testing/fixtures";
import {
  authenticateCandidateSession,
  beginCandidateSession,
  getCandidateSessionView,
  getInvitationLanding,
} from "./candidate-session";
import { updateCompanySettings } from "./company";

const CONSENTS = { terms: true, privacy: true, aiInterview: true } as const;

async function begin(token: string, camera: boolean) {
  const begun = await beginCandidateSession(
    token,
    { confirmedName: "Omar Test", consents: { ...CONSENTS, camera } },
    {},
  );
  const view = await getCandidateSessionView(
    await authenticateCandidateSession(begun.sessionId, begun.credential),
  );
  return { ...begun, view };
}

describe("optional candidate camera (self-view, never recorded)", () => {
  it("is off unless the company opts in, even if the candidate asks for it", async () => {
    const { admin, template } = await createWorkspace();
    const invite = await inviteCandidate(admin, template.id);
    expect((await getInvitationLanding(invite.token)).interview.camera).toBe(false);
    const { sessionId, view } = await begin(invite.token, true);
    expect(view.camera).toBe(false);
    expect(await db.consentRecord.count({ where: { sessionId, consentType: "CAMERA" } })).toBe(0);
  });

  it("records the candidate's choice when the company offers the camera", async () => {
    const { admin, template } = await createWorkspace();
    await updateCompanySettings(admin, { cameraEnabled: true });

    const accepted = await inviteCandidate(admin, template.id);
    expect((await getInvitationLanding(accepted.token)).interview.camera).toBe(true);
    const on = await begin(accepted.token, true);
    expect(on.view.camera).toBe(true);
    const consent = await db.consentRecord.findFirst({
      where: { sessionId: on.sessionId, consentType: "CAMERA" },
    });
    expect(consent).toMatchObject({ accepted: true, policyVersion: expect.any(String) });

    const declined = await inviteCandidate(admin, template.id, {
      firstName: "Lina",
      lastName: "Test",
      email: "lina@example.com",
    });
    const off = await begin(declined.token, false);
    expect(off.view.camera).toBe(false);
    expect(
      await db.consentRecord.findFirst({
        where: { sessionId: off.sessionId, consentType: "CAMERA" },
      }),
    ).toMatchObject({ accepted: false });

    // Nothing camera-related is stored as media: no recordings exist for either session.
    expect(
      await db.recording.count({ where: { sessionId: { in: [on.sessionId, off.sessionId] } } }),
    ).toBe(0);
  });
});
