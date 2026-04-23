import { prisma } from "@/lib/db";
import { pushToClay } from "./clay-client";
import { enrichWithApify } from "./apify-client";
import { EnrichmentData } from "./types";
import { decrypt } from "@/lib/crypto";

/**
 * Look up an AppSetting by key. Returns decrypted value + enabled, or null.
 */
async function getSetting(
  key: string,
): Promise<{ value: string; enabled: boolean } | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (!setting) return null;
  try {
    const decrypted = decrypt(setting.value);
    return { value: decrypted, enabled: setting.enabled };
  } catch {
    // Not encrypted (e.g. "true"/"false" flag values)
    return { value: setting.value, enabled: setting.enabled };
  }
}

/**
 * Enrich a visitor using the configured enrichment provider.
 *
 * Priority:
 *   1. Clay (async) — if `clay_webhook_url` is configured + enabled, push visitor
 *      to Clay and return null immediately. Clay will call back via
 *      /api/webhook/clay/results with the enriched data.
 *   2. Apify (sync) — if `apify_api_key` is configured + enabled, run the
 *      LinkedIn profile scraper synchronously and persist results now.
 *
 * Returns EnrichmentData for the sync (Apify) path. Returns null if we pushed
 * to Clay (data will arrive later) OR if no provider is available.
 */
export async function enrichVisitor(
  visitorId: string,
): Promise<EnrichmentData | null> {
  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    select: { linkedinUrl: true, email: true, companyName: true },
  });

  if (!visitor?.linkedinUrl) {
    console.log(`[Enrichment] Skipping visitor ${visitorId}: no LinkedIn URL`);
    return null;
  }

  // 1. Clay (primary) — webhook push, async callback
  const claySetting = await getSetting("clay_enabled");
  if (claySetting?.enabled) {
    const clayWebhookUrl = await getSetting("clay_webhook_url");
    if (clayWebhookUrl?.value) {
      console.log(`[Enrichment] Pushing visitor ${visitorId} to Clay`);
      const pushed = await pushToClay(
        visitorId,
        visitor.linkedinUrl,
        visitor.email,
        clayWebhookUrl.value,
      );
      if (pushed) {
        // Clay handles the enrichment async and calls our /api/webhook/clay/results
        return null;
      }
      console.warn(
        `[Enrichment] Clay push failed for ${visitorId}, falling back to Apify`,
      );
    }
  }

  // 2. Apify (fallback) — synchronous
  const apifySetting = await getSetting("apify_enabled");
  if (!apifySetting?.enabled) {
    console.log(`[Enrichment] No enrichment provider enabled for ${visitorId}`);
    return null;
  }

  const apifyApiKey = await getSetting("apify_api_key");
  if (!apifyApiKey?.value) {
    console.log(`[Enrichment] Apify enabled but no API key set`);
    return null;
  }

  console.log(`[Enrichment] Using Apify for visitor ${visitorId}`);
  const data = await enrichWithApify(visitor.linkedinUrl, apifyApiKey.value);

  if (!data) {
    console.log(`[Enrichment] Apify returned no data for visitor ${visitorId}`);
    return null;
  }

  // Persist enrichment result
  await prisma.enrichmentResult.upsert({
    where: { visitorId },
    create: {
      visitorId,
      source: "apify",
      profileData: JSON.parse(JSON.stringify(data)),
      companyData: data.company
        ? JSON.parse(JSON.stringify({
            name: data.company,
            domain: data.companyDomain,
            size: data.companySize,
            industry: data.industry,
            linkedinUrl: data.companyLinkedinUrl,
            description: data.companyDescription,
            founded: data.companyFounded,
            revenue: data.companyRevenue,
          }))
        : null,
    },
    update: {
      source: "apify",
      profileData: JSON.parse(JSON.stringify(data)),
      companyData: data.company
        ? JSON.parse(JSON.stringify({
            name: data.company,
            domain: data.companyDomain,
            size: data.companySize,
            industry: data.industry,
            linkedinUrl: data.companyLinkedinUrl,
            description: data.companyDescription,
            founded: data.companyFounded,
            revenue: data.companyRevenue,
          }))
        : null,
      enrichedAt: new Date(),
    },
  });

  // Update visitor record with enriched data (fill in missing fields)
  await prisma.visitor.update({
    where: { id: visitorId },
    data: {
      email: visitor.email || data.email || undefined,
      companyName: visitor.companyName || data.company || undefined,
      industry: data.industry || undefined,
      employeeCount: data.companySize || undefined,
    },
  });

  return data;
}
