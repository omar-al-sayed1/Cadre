import { db, isUniqueConstraintError, type TransactionClient } from "@repo/database";
import type { CompanyRole, NotificationType } from "@repo/shared";

/** In-app notifications; `dedupeKey` prevents duplicates for the same event (spec §69). */
export async function notifyCompanyMembers(
  input: {
    companyId: string;
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    dedupeKey: string;
    roles?: CompanyRole[];
    /** Only these members (still filtered to current members of the company). */
    userIds?: string[];
  },
  tx?: TransactionClient,
): Promise<number> {
  const client = tx ?? db;
  const members = await client.companyMember.findMany({
    where: {
      companyId: input.companyId,
      deletedAt: null,
      ...(input.roles ? { role: { in: input.roles } } : {}),
      ...(input.userIds ? { userId: { in: input.userIds } } : {}),
    },
    select: { userId: true },
  });
  let created = 0;
  for (const member of members) {
    try {
      await client.notification.create({
        data: {
          companyId: input.companyId,
          userId: member.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link,
          dedupeKey: `${input.dedupeKey}:${member.userId}`,
        },
      });
      created += 1;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }
  return created;
}

export async function listNotifications(userId: string, companyId: string, limit = 20) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId, companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.notification.count({ where: { userId, companyId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}
