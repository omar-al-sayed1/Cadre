import { NextResponse } from "next/server";
import { beginCandidateSession, rateLimit } from "@repo/core";
import { beginSessionSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { candidateIpHash, setCandidateCookie } from "@/server/candidate-auth";

/**
 * Pre-interview: identity confirmation + consent → session credential cookie.
 * Rate limited per IP to slow down token guessing.
 */
export const POST = route<{ token: string }>(async (req, { params }) => {
  const ipHash = candidateIpHash(req);
  await rateLimit("invitationTokenLookup", ipHash);
  const input = await parseBody(req, beginSessionSchema);
  const result = await beginCandidateSession(params.token, input, {
    ipHash,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  const response = NextResponse.json({ sessionId: result.sessionId, resumed: result.resumed });
  setCandidateCookie(response, result.sessionId, result.credential);
  return response;
});
