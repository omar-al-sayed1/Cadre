import { can, listMembers } from "@repo/core";
import { requireActor } from "@/server/auth-context";
import { TeamManager } from "./team-manager";

export default async function TeamSettingsPage() {
  const actor = await requireActor();
  const { members, invitations } = await listMembers(actor);
  return (
    <TeamManager
      canManage={can(actor, "team.manage")}
      currentUserId={actor.userId}
      members={members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }))}
    />
  );
}
