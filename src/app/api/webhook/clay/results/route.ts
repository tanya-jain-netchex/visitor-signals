import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClayResultToEnrichment } from "@/lib/enrichment/clay-client";
import { scoreVisitor } from "@/lib/scoring/engine";

/**
 * Clay callback webhook.
 *
 * Clay tables POST enriched rows back here via an HTTP action column.
 * The row must include our `visitor_id` (passthrough column) so we know
 * which Visitor to attach the enrichment to.
 *
 * After saving the enrichment, we re-run scoring so the enriched fields
 * contribute to firmographics / persona scoring.
 */
export async function POST(request: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const visitorId =
    (typeof raw.visitor_id === "string" && raw.visitor_id) ||
    (typeof raw.visitorId === "string" && raw.visitorId) ||
    (typeof raw["Visitor Id"] === "string" && raw["Visitor Id"]) ||
    (typeof raw["Visitor ID"] === "string" && raw["Visitor ID"]) ||
    null;

  if (!visitorId) {
    console.warn("[Clay Callback] Missing visitor_id in payload", Object.keys(raw));
    return NextResponse.json(
      { error: "Missing visitor_id in payload" },
      { status: 400 }
    );
  }

  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    select: { id: true, email: true, companyName: true },
  });

  if (!visitor) {
    // Don't 404 — that makes Clay mark the row as failed. This commonly happens
    // for Clay test rows (e.g. visitor_id="test_123") that exist in the Clay
    // table but were never ingested via our webhook. Log and return 200.
    console.warn(
      `[Clay Callback] Visitor ${visitorId} not found in DB — skipping. ` +
        `(Likely a Clay test row. Only visitor_ids created via our RB2B webhook will match.)`
    );
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "visitor_not_found",
      visitorId,
    });
  }

  const data = mapClayResultToEnrichment(raw);

  console.log(
    `[Clay Callback] Received enrichment for ${visitorId}: ` +
      `${data.firstName ?? "?"} ${data.lastName ?? ""} @ ${data.company ?? "?"} (${data.email ?? "no email"})`
  );

  // Save EnrichmentResult (upsert)
  await prisma.enrichmentResult.upsert({
    where: { visitorId },
    create: {
      visitorId,
      source: "clay",
      profileData: JSON.parse(JSON.stringify(data)),
      companyData: data.company
        ? JSON.parse(
            JSON.stringify({
              name: data.company,
              domain: data.companyDomain,
              size: data.companySize,
              industry: data.industry,
              linkedinUrl: data.companyLinkedinUrl,
              description: data.companyDescription,
              founded: data.companyFounded,
              revenue: data.companyRevenue,
            })
          )
        : null,
    },
    update: {
      source: "clay",
      profileData: JSON.parse(JSON.stringify(data)),
      companyData: data.company
        ? JSON.parse(
            JSON.stringify({
              name: data.company,
              domain: data.companyDomain,
              size: data.companySize,
              industry: data.industry,
              linkedinUrl: data.companyLinkedinUrl,
              description: data.companyDescription,
              founded: data.companyFounded,
              revenue: data.companyRevenue,
            })
          )
        : null,
      enrichedAt: new Date(),
    },
  });

  // Fill in missing Visitor fields from enrichment. We need to backfill *every*
  // field that scoring reads, otherwise the re-score below sees stale nulls and
  // doesn't reflect the enriched data. Scoring reads: industry, employeeCount,
  // state, title, linkedinUrl, estimatedRevenue (see src/lib/scoring/rules.ts).
  // Note: we read from the freshly-loaded `visitor` (pre-enrichment) so existing
  // RB2B data wins; enrichment only fills blanks.
  const full = await prisma.visitor.findUniqueOrThrow({
    where: { id: visitorId },
    select: {
      email: true,
      companyName: true,
      title: true,
      industry: true,
      employeeCount: true,
      estimatedRevenue: true,
      linkedinUrl: true,
      state: true,
      city: true,
    },
  });

  await prisma.visitor.update({
    where: { id: visitorId },
    data: {
      email: full.email || data.email || undefined,
      companyName: full.companyName || data.company || undefined,
      title: full.title || data.title || undefined,
      industry: full.industry || data.industry || undefined,
      employeeCount: full.employeeCount || data.companySize || undefined,
      estimatedRevenue: full.estimatedRevenue || data.companyRevenue || undefined,
      linkedinUrl: full.linkedinUrl || data.linkedinUrl || undefined,
      status: "ENRICHED",
    },
  });

  // Re-score now that we have enriched data
  try {
    await scoreVisitor(visitorId);
  } catch (err) {
    console.warn(`[Clay Callback] Re-scoring failed for ${visitorId}:`, err);
  }

  return NextResponse.json({ ok: true, visitorId });
}
