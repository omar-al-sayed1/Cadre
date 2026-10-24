import { NextResponse } from "next/server";
import { db } from "@repo/database";

/** Liveness/readiness probe for load balancers. Exposes no internals. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
