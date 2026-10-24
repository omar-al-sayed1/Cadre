import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActorContext } from "@repo/core";
import { db } from "@repo/database";
import { AppError } from "@repo/shared";
import { anonymize } from "@repo/shared/server";
import { getServerEnv } from "@repo/config/env";
import { auth } from "@/lib/auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  platformRole: "USER" | "SUPER_ADMIN";
  activeCompanyId: string | null;
}

/** The signed-in recruiter, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      emailVerified: true,
      platformRole: true,
      activeCompanyId: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) return null;
  return user;
});

export async function clientIpHash(): Promise<string | undefined> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
  return ip ? anonymize(ip, getServerEnv().AUTH_SECRET) : undefined;
}

/** Resolve the company context for a user: their active company, else their first membership. */
const resolveActor = cache(async (user: CurrentUser): Promise<ActorContext | null> => {
  const memberships = await db.companyMember.findMany({
    where: { userId: user.id, deletedAt: null, company: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { companyId: true, role: true },
  });
  const membership =
    memberships.find((m) => m.companyId === user.activeCompanyId) ?? memberships[0];
  if (!membership) return null;
  return {
    userId: user.id,
    userName: user.name,
    companyId: membership.companyId,
    role: membership.role,
    platformRole: user.platformRole,
    ipHash: await clientIpHash(),
    requestId: (await headers()).get("x-request-id") ?? undefined,
  };
});

/** For server components/pages: redirect to login or onboarding as needed. */
export async function requireActor(): Promise<ActorContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = await resolveActor(user);
  if (!actor) redirect("/onboarding");
  return actor;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: throw typed errors instead of redirecting. */
export async function getApiActor(): Promise<ActorContext> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED");
  const actor = await resolveActor(user);
  if (!actor) throw new AppError("FORBIDDEN", { message: "Create or join a company first." });
  return actor;
}

export async function getApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED");
  return user;
}
