import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scoreVisitor } from "@/lib/scoring/engine";
import { pushToClay } from "@/lib/enrichment/clay-client";
import { decrypt } from "@/lib/crypto";

// Allow this route to take up to 120s on Vercel (polling for Clay callback can take 30-90s)
export const maxDuration = 120;

async function getSetting(key: string) {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (!setting) return null;
  try {
    return { value: decrypt(setting.value), enabled: setting.enabled };
  } catch {
    return { value: setting.value, enabled: setting.enabled };
  }
}

/**
 * Re-enrich & Re-score endpoint — triggered by the button on the visitor page.
 *
 * Flow:
 *   1. Capture the current enrichment timestamp for the visitor (if any).
 *   2. Push the visitor to the Clay inbound webhook (idempotent on visitor_id —
 *      Clay upserts the row, so a second push won't duplicate).
 *   3. Poll our own DB for a newer EnrichmentResult.enrichedAt timestamp, which
 *      indicates Clay's HTTP API column has POSTed the enriched row back to
 *      /api/webhook/clay/results.
 *   4. Run scoreVisitor() — works whether or not enrichment arrived in time.
 *
 * The callback at /api/webhook/clay/results is what actually persists the
 * enrichment — this endpoint just kicks off the round trip and waits.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const visitor = await prisma.visitor.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      linkedinUrl: true,
    },
  });

  if (!visitor) {
    return NextResponse.json({ error: "Visitor not found" }, { status: 404 });
  }

  let enrichmentUpdated = false;
  let skippedReason: string | null = null;

  // Freshness window: if we already have enrichment newer than this, skip the
  // push-and-poll dance entirely. Clay upserts on duplicate visitor_id and won't
  // re-fire its HTTP API column, so polling on a re-push just burns 90s waiting
  // for a callback that will never come.
  const ENRICHMENT_FRESH_MS = 60 * 60 * 1000; // 1 hour

  const clayEnabled = await getSetting("clay_enabled");
  if (clayEnabled?.enabled && visitor.linkedinUrl) {
    const webhook = await getSetting("clay_webhook_url");

    if (webhook?.value) {
      // Capture current enrichment timestamp so we can detect a fresh callback
      const before = await prisma.enrichmentResult.findUnique({
        where: { visitorId: id },
        select: { enrichedAt: true },
      });
      const beforeTs = before?.enrichedAt?.getTime() ?? 0;
      const ageMs = beforeTs > 0 ? Date.now() - beforeTs : Infinity;

      if (ageMs < ENRICHMENT_FRESH_MS) {
        // Enrichment is recent — skip Clay round-trip, just re-score.
        skippedReason = "fresh_enrichment_exists";
        console.log(
          `[Re-score] Skipping Clay push for ${id} — enrichment is ${Math.round(
            ageMs / 1000
          )}s old (fresh). Re-scoring with existing data.`
        );
      } else {
        await prisma.visitor.update({
          where: { id },
          data: { status: "ENRICHING" },
        });

        const pushed = await pushToClay(
          visitor.id,
          visitor.linkedinUrl,
          visitor.email,
          webhook.value
        );

        if (pushed) {
          // Poll our DB for the Clay callback to land. Capped at 30s because if
          // Clay's HTTP column isn't going to fire (e.g. dup row that Clay
          // doesn't re-enrich), waiting longer doesn't help — we'll just score
          // with what we have.
          const timeoutMs = 30_000;
          const intervalMs = 3_000;
          const startedAt = Date.now();

          while (Date.now() - startedAt < timeoutMs) {
            await new Promise((r) => setTimeout(r, intervalMs));
            const latest = await prisma.enrichmentResult.findUnique({
              where: { visitorId: id },
              select: { enrichedAt: true },
            });
            if (latest && latest.enrichedAt.getTime() > beforeTs) {
              enrichmentUpdated = true;
              console.log(
                `[Re-score] Clay callback arrived for ${id} after ${Math.round(
                  (Date.now() - startedAt) / 1000
                )}s`
              );
              break;
            }
          }

          if (!enrichmentUpdated) {
            console.warn(
              `[Re-score] Timed out waiting for Clay callback for ${id} — scoring with existing data`
            );
          }
        } else {
          console.warn(`[Re-score] Clay push failed for ${id}`);
        }
      }
    } else {
      console.log(`[Re-score] Clay enabled but clay_webhook_url not set`);
    }
  }

  // Step 4: Score (reads Visitor + pageVisits + enrichment from DB)
  await prisma.visitor.update({
    where: { id },
    data: { status: "SCORING" },
  });

  const scoreResult = await scoreVisitor(id);

  return NextResponse.json({
    success: true,
    visitorId: id,
    enrichmentUpdated,
    skippedReason,
    score: {
      total: scoreResult.totalScore,
      tier: scoreResult.tier,
      qualified: scoreResult.isQualified,
      disqualifyReason: scoreResult.disqualifyReason,
    },
  });
}
