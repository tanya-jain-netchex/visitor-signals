import { EnrichmentData, ExperienceEntry } from "./types";

/**
 * Actor: harvestapi~linkedin-profile-scraper
 * Endpoint: run-sync-get-dataset-items (synchronous — runs and returns results in one call)
 */
const ACTOR_ID = "harvestapi~linkedin-profile-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

/**
 * Map harvestapi~linkedin-profile-scraper output to our EnrichmentData interface.
 *
 * Typical output fields:
 *   id, publicIdentifier, firstName, lastName, headline, summary,
 *   location, industryName, positions (array), skills (array),
 *   emailAddress, companyName, ...
 */
function mapActorResult(raw: Record<string, unknown>): EnrichmentData {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Extract current position from positions array
  const positions = Array.isArray(raw.positions)
    ? (raw.positions as Record<string, unknown>[])
    : Array.isArray(raw.experience)
      ? (raw.experience as Record<string, unknown>[])
      : [];

  const currentPosition = positions.find(
    (p) => p.isCurrent === true || !p.endDate || p.endDate === null
  ) ?? positions[0];

  const experience: ExperienceEntry[] = positions.map((p) => ({
    title: str(p.title) || str(p.jobTitle) || "",
    company:
      str(p.companyName) ||
      str(p.company) ||
      str((p.company as Record<string, unknown>)?.name) ||
      "",
    startDate: str(p.startDate) || str((p.timePeriod as Record<string, unknown>)?.startDate) || null,
    endDate: str(p.endDate) || str((p.timePeriod as Record<string, unknown>)?.endDate) || null,
    isCurrent: Boolean(p.isCurrent ?? !p.endDate),
  }));

  // Skills — harvestapi returns array of strings or objects
  const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
  const skills = rawSkills.map((s) =>
    typeof s === "string" ? s : str((s as Record<string, unknown>).name) || ""
  ).filter(Boolean);

  // Email — harvestapi field is emailAddress
  const email =
    str(raw.emailAddress) ||
    str(raw.email) ||
    str(raw.workEmail) ||
    null;

  // Company info
  const company =
    str(raw.companyName) ||
    str(currentPosition?.companyName) ||
    str((currentPosition?.company as Record<string, unknown>)?.name) ||
    null;

  const title =
    str(raw.title) ||
    str(raw.headline) ||
    str(currentPosition?.title) ||
    null;

  // Location
  const location =
    str(raw.location) ||
    str(raw.locationName) ||
    str(raw.geoLocationName) ||
    null;

  return {
    email,
    firstName: str(raw.firstName) || str(raw.first_name) || null,
    lastName: str(raw.lastName) || str(raw.last_name) || null,
    title,
    company,
    companyDomain: str(raw.companyDomain) || str(raw.company_domain) || null,
    companySize:
      str(raw.companySize) ||
      str(raw.company_size) ||
      str(raw.employeeCount) ||
      null,
    industry:
      str(raw.industryName) ||
      str(raw.industry) ||
      str(raw.companyIndustry) ||
      null,
    linkedinUrl:
      str(raw.linkedinUrl) ||
      str(raw.profileUrl) ||
      str(raw.url) ||
      (raw.publicIdentifier
        ? `https://www.linkedin.com/in/${raw.publicIdentifier}`
        : null),
    location,
    experience,
    skills,
    headline: str(raw.headline) || null,
    summary: str(raw.summary) || str(raw.description) || null,
    companyLinkedinUrl:
      str(raw.companyLinkedinUrl) ||
      str(raw.company_linkedin_url) ||
      null,
    companyDescription:
      str(raw.companyDescription) ||
      str(raw.company_description) ||
      null,
    companyFounded: str(raw.companyFounded) || str(raw.founded) || null,
    companyRevenue: str(raw.companyRevenue) || str(raw.revenue) || null,
  };
}

/**
 * Enrich a LinkedIn profile using harvestapi~linkedin-profile-scraper.
 * Uses the synchronous run-sync-get-dataset-items endpoint — single HTTP call.
 * Only the API token is required from settings.
 */
export async function enrichWithApify(
  linkedinUrl: string,
  apiToken: string
): Promise<EnrichmentData | null> {
  const endpoint = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiToken}`;

  console.log(`[Apify] Enriching ${linkedinUrl} via ${ACTOR_ID}`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [{ url: linkedinUrl }],
      }),
      // Allow up to 2 minutes for the actor to complete
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[Apify] Actor returned ${res.status}: ${text.slice(0, 300)}`
      );
      return null;
    }

    const items: unknown = await res.json();

    if (!Array.isArray(items) || items.length === 0) {
      console.warn(`[Apify] Actor returned no items for ${linkedinUrl}`);
      return null;
    }

    const raw = items[0] as Record<string, unknown>;
    const data = mapActorResult(raw);

    if (!data.firstName && !data.email && !data.company) {
      console.warn(`[Apify] Result had no useful fields for ${linkedinUrl}`);
      return null;
    }

    console.log(
      `[Apify] Enriched: ${data.firstName} ${data.lastName} @ ${data.company} (${data.email})`
    );
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.warn(`[Apify] Actor timed out after 2 minutes for ${linkedinUrl}`);
    } else {
      console.warn(`[Apify] Request failed:`, err);
    }
    return null;
  }
}
