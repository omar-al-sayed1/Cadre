import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { authenticateCandidateSession, rateLimit } from "@repo/core";
import { getServerEnv } from "@repo/config/env";
import { anonymize } from "@repo/shared/server";
import type { NextRequest } from "next/server";
import { clientIp } from "./api";

/**
 * Candidate session credentials live in an httpOnly cookie scoped per session.
 * They are issued after consent and rotated whenever the interview is reopened.
 */
export const candidateCookieName = (sessionId: string) =>
  `aii_cs_${sessionId.replace(/[^A-Za-z0-9]/g, "")}`;

export function setCandidateCookie(
  response: NextResponse,
  sessionId: string,
  credential: string,
): void {
  response.cookies.set(candidateCookieName(sessionId), credential, {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function candidateSessionFromRequest(sessionId: string) {
  const jar = await cookies();
  return authenticateCandidateSession(sessionId, jar.get(candidateCookieName(sessionId))?.value);
}

export async function hasCandidateCookie(sessionId: string): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(candidateCookieName(sessionId))?.value);
}

export function candidateIpHash(req: NextRequest): string {
  return anonymize(clientIp(req), getServerEnv().AUTH_SECRET);
}

export async function limitCandidate(
  req: NextRequest,
  name: Parameters<typeof rateLimit>[0],
  sessionId: string,
): Promise<void> {
  await rateLimit(name, `${sessionId}:${candidateIpHash(req)}`);
}
