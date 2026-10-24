import { db } from "@repo/database";
import { teamInviteEmail } from "@repo/email";
import { jobQueue } from "@repo/queue";
import { addDays, AppError } from "@repo/shared";
import { generateSecureToken, hashToken } from "@repo/shared/server";
import type { CompanyRole } from "@repo/shared";
import {
  inviteMemberSchema,
  updateMemberRoleSchema,
  type InviteMemberInput,
} from "@repo/validation";
import { audit, AUDIT_ACTIONS } from "../audit";
import { requirePermission, type ActorContext } from "../context";
import { ROLE_LABELS } from "../permissions";
import { appUrl } from "../runtime";

export async function listMembers(ctx: ActorContext) {
  requirePermission(ctx, "company.read");
  const [members, invitations] = await Promise.all([
    db.companyMember.findMany({
      where: { companyId: ctx.companyId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, lastLoginAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.teamInvitation.findMany({
      where: {
        companyId: ctx.companyId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invitations };
}

export async function inviteMember(ctx: ActorContext, rawInput: InviteMemberInput) {
  requirePermission(ctx, "team.manage");
  const input = inviteMemberSchema.parse(rawInput);
  const existing = await db.companyMember.findFirst({
    where: { companyId: ctx.companyId, deletedAt: null, user: { email: input.email } },
  });
  if (existing)
    throw new AppError("CONFLICT", { message: "This person is already a team member." });

  const token = generateSecureToken();
  const company = await db.company.findUniqueOrThrow({
    where: { id: ctx.companyId },
    select: { name: true },
  });
  const invitation = await db.$transaction(async (tx) => {
    const created = await tx.teamInvitation.create({
      data: {
        companyId: ctx.companyId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt: addDays(new Date(), 7),
        invitedById: ctx.userId,
      },
    });
    const email = teamInviteEmail({
      inviterName: ctx.userName,
      companyName: company.name,
      role: ROLE_LABELS[input.role],
      url: appUrl(`/invite/${token}`),
    });
    await jobQueue.enqueue(
      "email.send",
      {
        to: input.email,
        ...email,
        companyId: ctx.companyId,
        idempotencyKey: `team-invite:${created.id}`,
      },
      { tx, uniqueKey: `email:team-invite:${created.id}` },
    );
    await audit(
      ctx,
      {
        action: AUDIT_ACTIONS.memberInvited,
        entityType: "team_invitation",
        entityId: created.id,
        metadata: { role: input.role },
      },
      tx,
    );
    return created;
  });
  return { invitation, url: appUrl(`/invite/${token}`) };
}

export async function revokeTeamInvitation(ctx: ActorContext, invitationId: string): Promise<void> {
  requirePermission(ctx, "team.manage");
  await db.teamInvitation.updateMany({
    where: { id: invitationId, companyId: ctx.companyId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getTeamInvitationByToken(token: string) {
  const invitation = await db.teamInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { company: { select: { id: true, name: true } } },
  });
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    invitation.expiresAt < new Date()
  ) {
    throw new AppError("NOT_FOUND", { message: "This invitation is invalid or has expired." });
  }
  return invitation;
}

export async function acceptTeamInvitation(
  user: { id: string; name: string; email: string },
  token: string,
) {
  const invitation = await getTeamInvitationByToken(token);
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError("FORBIDDEN", {
      message: `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.`,
    });
  }
  await db.$transaction(async (tx) => {
    await tx.companyMember.upsert({
      where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } },
      update: { deletedAt: null, role: invitation.role },
      create: {
        companyId: invitation.companyId,
        userId: user.id,
        role: invitation.role,
        invitedById: invitation.invitedById,
      },
    });
    await tx.teamInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { activeCompanyId: invitation.companyId },
    });
    await audit(
      {
        userId: user.id,
        userName: user.name,
        companyId: invitation.companyId,
        role: invitation.role,
        platformRole: "USER",
      },
      {
        action: AUDIT_ACTIONS.memberJoined,
        entityType: "company_member",
        entityId: user.id,
        metadata: { role: invitation.role },
      },
      tx,
    );
  });
  return invitation.companyId;
}

async function assertNotLastAdmin(companyId: string, userId: string): Promise<void> {
  const admins = await db.companyMember.count({
    where: { companyId, role: "COMPANY_ADMIN", deletedAt: null },
  });
  const target = await db.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (target?.role === "COMPANY_ADMIN" && admins <= 1) {
    throw new AppError("CONFLICT", { message: "A company needs at least one admin." });
  }
}

export async function updateMemberRole(
  ctx: ActorContext,
  userId: string,
  rawInput: { role: CompanyRole },
) {
  requirePermission(ctx, "team.manage");
  const { role } = updateMemberRoleSchema.parse(rawInput);
  if (role !== "COMPANY_ADMIN") await assertNotLastAdmin(ctx.companyId, userId);
  const member = await db.companyMember.update({
    where: { companyId_userId: { companyId: ctx.companyId, userId } },
    data: { role },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.memberRoleChanged,
    entityType: "company_member",
    entityId: userId,
    metadata: { role },
  });
  return member;
}

export async function removeMember(ctx: ActorContext, userId: string): Promise<void> {
  requirePermission(ctx, "team.manage");
  await assertNotLastAdmin(ctx.companyId, userId);
  await db.companyMember.update({
    where: { companyId_userId: { companyId: ctx.companyId, userId } },
    data: { deletedAt: new Date() },
  });
  await audit(ctx, {
    action: AUDIT_ACTIONS.memberRemoved,
    entityType: "company_member",
    entityId: userId,
  });
}
