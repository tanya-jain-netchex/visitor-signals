import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scoreVisitor } from "@/lib/scoring/engine";

/**
 * POST /api/admin/rescore
 *
 * Bulk local rescore — runs the scoring engine against existing DB state
 * (Visitor + PageVisits + EnrichmentResult). NEVER re-pushes to Clay, so this
 * does not consume Clay credits and is safe to run on demand after changing
 * ICP config.
 *
 * Body options (all optional):
 *   - status: "QUALIFIED" | "DISQUALIFIED" — filter by current status.
 *             Omit to include both (useful after changing the score threshold).
 *   - source: "webhook" | "csv" | ... — filter by visitor source.
 *   - reason: substring of the existing disqualifyReason to narrow the set.
 *   - limit:  number — only rescore the most recently-updated N visitors.
 *             Defaults to 50 to avoid long-running bulk jobs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { source, reason, status, limit } = body as {
    source?: string;
    reason?: string;
    status?: "QUALIFIED" | "DISQUALIFIED";
    limit?: number;
  };

  const take = Math.max(1, Math.min(Number(limit) || 50, 500));

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else {
    // Default: both qualified and disqualified (the two terminal scoring states)
    where.status = { in: ["QUALIFIED", "DISQUALIFIED"] };
  }
  if (source) where.source = source;

  const visitors = await prisma.visitor.findMany({
    where: where as Parameters<typeof prisma.visitor.findMany>[0]["where"],
    select: { id: true, icpScore: { select: { disqualifyReason: true } } },
    orderBy: { updatedAt: "desc" },
    take,
  });

  // Optionally filter by disqualify reason substring
  const targets = reason
    ? visitors.filter((v) => v.icpScore?.disqualifyReason?.includes(reason))
    : visitors;

  const results = { rescored: 0, qualified: 0, disqualified: 0, errors: 0 };

  for (const v of targets) {
    try {
      await prisma.visitor.update({
        where: { id: v.id },
        data: { status: "SCORING" },
      });

      const result = await scoreVisitor(v.id);
      results.rescored++;
      if (result.isQualified) results.qualified++;
      else results.disqualified++;
    } catch (err) {
      console.error(`[Admin/Rescore] Failed for visitor ${v.id}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ...results, total: targets.length, limit: take });
}
