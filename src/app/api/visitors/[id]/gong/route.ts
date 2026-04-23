import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isGongConfigured, refreshVisitorGongCache } from "@/lib/gong/client";

/**
 * POST /api/visitors/[id]/gong
 *
 * Refreshes the Gong-backed cache on the Visitor row:
 *   - Salesforce object link (type + id + instance URL)
 *   - Prior call count, prior email count, last touchpoint timestamp
 *
 * This is an on-demand action so the dashboard doesn't hammer Gong on every
 * page render. Visitor detail page calls this once, then reads the cached
 * fields for all subsequent views.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const visitor = await prisma.visitor.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!visitor) {
    return NextResponse.json({ error: "Visitor not found" }, { status: 404 });
  }
  if (!visitor.email) {
    return NextResponse.json(
      { error: "Visitor has no email — cannot query Gong" },
      { status: 400 },
    );
  }

  if (!(await isGongConfigured())) {
    return NextResponse.json(
      { error: "Gong is not configured or enabled in Settings" },
      { status: 400 },
    );
  }

  try {
    await refreshVisitorGongCache(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/visitors/${id}/gong] refresh failed:`, msg);
    return NextResponse.json(
      { error: `Gong lookup failed: ${msg}` },
      { status: 502 },
    );
  }

  const refreshed = await prisma.visitor.findUnique({
    where: { id },
    select: {
      sfObjectType: true,
      sfId: true,
      sfInstanceUrl: true,
      priorCallCount: true,
      priorEmailCount: true,
      lastTouchpointAt: true,
      gongCheckedAt: true,
    },
  });

  return NextResponse.json({ success: true, gong: refreshed });
}
