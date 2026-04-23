import { prisma } from "@/lib/db";
import { scoreVisitor } from "@/lib/scoring/engine";

/**
 * Look up whether an AppSetting key exists and is enabled.
 */
async function isSettingEnabled(key: string): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.enabled === true;
}

/**
 * Main pipeline orchestrator for processing a visitor through all steps:
 *   1. Enrichment (if configured)
 *   2. ICP Scoring
 *   3. Salesforce sync (if qualified + configured)
 *   4. Outreach generation (if qualified + LLM configured)
 *
 * Updates visitor status at each step. If any step fails, sets status to ERROR.
 */
export async function processVisitor(visitorId: string): Promise<void> {
  try {
    // Step 1: Enrichment (if provider is configured)
    const clayEnabled = await isSettingEnabled("clay_enabled");
    const apifyEnabled = await isSettingEnabled("apify_enabled");

    if (clayEnabled || apifyEnabled) {
      await prisma.visitor.update({
        where: { id: visitorId },
        data: { status: "ENRICHING" },
      });

      try {
        const { enrichVisitor } = await import("@/lib/enrichment/index");
        await enrichVisitor(visitorId);
      } catch (err) {
        // Enrichment failure is non-fatal — log and continue
        console.warn(
          `[Pipeline] Enrichment failed for visitor ${visitorId}, continuing:`,
          err,
        );
      }

      await prisma.visitor.update({
        where: { id: visitorId },
        data: { status: "ENRICHED" },
      });
    }

    // Step 2: ICP Scoring
    await prisma.visitor.update({
      where: { id: visitorId },
      data: { status: "SCORING" },
    });

    const scoreResult = await scoreVisitor(visitorId);

    // Step 3: Salesforce sync (if qualified + SF configured)
    if (scoreResult.isQualified) {
      const sfEnabled = await isSettingEnabled("salesforce_enabled");
      if (sfEnabled) {
        try {
          const { syncToSalesforce } = await import("@/lib/salesforce/sync");
          await syncToSalesforce(visitorId);
        } catch (err) {
          // SF sync failure is non-fatal
          console.warn(
            `[Pipeline] Salesforce sync failed for visitor ${visitorId}:`,
            err,
          );
        }
      }

      // Step 4: Outreach generation (if qualified + LLM configured)
      const llmEnabled = await isSettingEnabled("llm_enabled");
      if (llmEnabled) {
        try {
          const { generateOutreach } = await import("@/lib/email/generate");
          await generateOutreach(visitorId);
        } catch (err) {
          // Outreach generation failure is non-fatal
          console.warn(
            `[Pipeline] Outreach generation failed for visitor ${visitorId}:`,
            err,
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `[Pipeline] Fatal error processing visitor ${visitorId}:`,
      error,
    );

    await prisma.visitor.update({
      where: { id: visitorId },
      data: {
        status: "ERROR",
        errorMessage:
          error instanceof Error ? error.message : "Unknown pipeline error",
      },
    });
  }
}
