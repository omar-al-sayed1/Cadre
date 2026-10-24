import { getServerEnv } from "@repo/config/env";
import { listNotifications, listUserCompanies } from "@repo/core";
import { db } from "@repo/database";
import { logger } from "@repo/shared";
import { AppShell } from "@/components/shell/app-shell";
import { requireActor, requireUser } from "@/server/auth-context";
import { getWorkspaceProducts } from "@/server/products";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const actor = await requireActor();
  const [company, memberships, notifications, products] = await Promise.all([
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { id: true, name: true, logoKey: true },
    }),
    listUserCompanies(user.id),
    // The bell is secondary: a failure here must not take every app page down with it.
    listNotifications(user.id, actor.companyId, 15).catch((error: unknown) => {
      logger.error("layout.notifications_failed", { error });
      return { items: [], unread: 0 };
    }),
    getWorkspaceProducts(actor.companyId),
  ]);
  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        platformRole: user.platformRole,
      }}
      company={{
        id: company.id,
        name: company.name,
        logoUrl: company.logoKey ? `/api/public/companies/${company.id}/logo` : null,
      }}
      role={actor.role}
      companies={memberships.map((m) => ({ id: m.company.id, name: m.company.name }))}
      notifications={{
        unread: notifications.unread,
        items: notifications.items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt?.toISOString() ?? null,
        })),
      }}
      products={products
        .filter((p) => p.status !== null)
        .map((p) => ({
          key: p.product.key,
          name: p.product.name,
          active: p.active,
          trialDaysLeft: p.trialDaysLeft,
        }))}
      demoMode={getServerEnv().DEMO_MODE}
    >
      {children}
    </AppShell>
  );
}
