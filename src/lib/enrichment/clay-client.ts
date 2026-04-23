import { EnrichmentData, ExperienceEntry } from "./types";

/**
 * Clay integration uses an ASYNC webhook flow:
 *
 * 1. We POST to the user's Clay table webhook with { visitor_id, linkedin_url }
 * 2. Clay runs enrichment columns (work email, company info, etc.)
 * 3. Clay POSTs the enriched row back to our callback endpoint
 *    (/api/webhook/clay/results) via an HTTP action column in the table
 *
 * This function only handles step 1 (the push to Clay). Results are received
 * asynchronously in the callback webhook route.
 */
export async function pushToClay(
  visitorId: string,
  linkedinUrl: string,
  email: string | null,
  clayWebhookUrl: string
): Promise<boolean> {
  console.log(`[Clay] Pushing visitor ${visitorId} (${linkedinUrl}) to Clay`);

  try {
    const res = await fetch(clayWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id: visitorId,
        linkedin_url: linkedinUrl,
        email,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(
        `[Clay] Push failed (${res.status}): ${await res.text().catch(() => "")}`
      );
      return false;
    }

    console.log(`[Clay] Successfully pushed visitor ${visitorId}`);
    return true;
  } catch (err) {
    console.warn(`[Clay] Push threw:`, err);
    return false;
  }
}

/**
 * Map Clay's callback payload to our EnrichmentData interface.
 * Clay normalizes column headers when sending to webhooks — we try common variants.
 */
export function mapClayResultToEnrichment(
  raw: Record<string, unknown>
): EnrichmentData {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Try common Clay column naming conventions: snake_case, camelCase, Title Case
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") {
        return v[0];
      }
    }
    return null;
  };

  const email = get(
    "WorkEmail",
    "work_email", "workEmail", "Work Email",
    "email", "Email"
  );

  // "Name" column in Build Week table is full name — split on first space
  const fullName = get("Name", "name", "full_name", "fullName");
  let splitFirst: string | null = null;
  let splitLast: string | null = null;
  if (fullName) {
    const parts = fullName.split(/\s+/);
    splitFirst = parts[0] ?? null;
    splitLast = parts.slice(1).join(" ") || null;
  }
  const firstName =
    get("first_name", "firstName", "First Name", "name_first") ?? splitFirst;
  const lastName =
    get("last_name", "lastName", "Last Name", "name_last") ?? splitLast;

  const title = get(
    "title", "Title",
    "job_title", "jobTitle", "Job Title",
    "current_title"
  );
  // "Org" and "Enrich Company" are both company name columns in Build Week table
  const company = get(
    "Org", "org",
    "Enrich Company", "enrich_company",
    "company", "company_name", "companyName", "Company", "Company Name",
    "current_company"
  );
  const companyDomain = get(
    "Domain", "domain",
    "company_domain", "companyDomain", "Company Domain",
    "website", "Website"
  );
  // Clay's "Size" is the string range ("10,001+ employees"); "Employee Count"
  // is numeric. Prefer the human-readable range for firmographic scoring.
  const companySize = get(
    "Size", "size",
    "company_size", "companySize", "Company Size",
    "EmployeeCount", "Employee Count", "employee_count", "employeeCount", "headcount"
  );
  const industry = get(
    "Industry", "industry",
    "company_industry", "companyIndustry"
  );
  const linkedinUrl = get(
    "LinkedinUrl",
    "Linkedin Url", "LinkedIn URL",
    "linkedin_url", "linkedinUrl", "linkedin"
  );
  // Prefer "Locality" (city, state) over "Location Name" (full address) for display
  const location = get(
    "Locality", "locality",
    "Location Name", "location_name",
    "location", "Location", "city"
  );
  const headline = get("Headline", "headline");
  // NOTE: do NOT fall back to "Description" here — in Clay's Build Week table
  // "Description" is the *company* description. Mapping it to summary caused
  // Professional Summary to display the company bio. Keep sources strictly
  // person-focused (Summary/summary/about only).
  const summary = get("Summary", "summary", "about");
  const companyLinkedinUrl = get(
    "CompanyLinkedinURL", "CompanyLinkedInURL", "CompanyLinkedinUrl",
    "Company Linkedin URL", "Company LinkedIn URL",
    "company_linkedin_url", "companyLinkedinUrl"
  );
  const companyDescription = get(
    "Description", "description",
    "company_description", "companyDescription", "Company Description"
  );
  const companyFounded = get(
    "company_founded", "companyFounded", "Company Founded", "founded"
  );
  // "Annual Revenue" is Clay's normalized range ("100B-1T")
  const companyRevenue = get(
    "AnnualRevenue",
    "Annual Revenue", "annual_revenue", "annualRevenue",
    "company_revenue", "companyRevenue", "Company Revenue",
    "revenue", "estimated_revenue",
    "Total Funding Amount Range Usd", "total_funding_amount_range_usd"
  );

  // Experience
  const rawExperience = raw.experience || raw.positions || raw.jobs;
  const experience: ExperienceEntry[] = Array.isArray(rawExperience)
    ? (rawExperience as Record<string, unknown>[]).map((p) => ({
        title: str(p.title) || str(p.jobTitle) || "",
        company: str(p.company) || str(p.companyName) || "",
        startDate: str(p.startDate) || str(p.start) || null,
        endDate: str(p.endDate) || str(p.end) || null,
        isCurrent: Boolean(p.isCurrent ?? !p.endDate),
      }))
    : [];

  // Skills
  const rawSkills = raw.skills;
  const skills: string[] = Array.isArray(rawSkills)
    ? rawSkills
        .map((s) =>
          typeof s === "string" ? s : str((s as Record<string, unknown>)?.name) || ""
        )
        .filter(Boolean)
    : typeof rawSkills === "string"
      ? rawSkills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    email,
    firstName,
    lastName,
    title,
    company,
    companyDomain,
    companySize,
    industry,
    linkedinUrl,
    location,
    experience,
    skills,
    headline,
    summary,
    companyLinkedinUrl,
    companyDescription,
    companyFounded,
    companyRevenue,
  };
}

/**
 * Legacy sync entrypoint — kept so existing enrichment/index.ts import still resolves.
 * With the webhook flow, real enrichment happens via pushToClay + callback route.
 */
export async function enrichWithClay(
  _linkedinUrl: string,
  _apiKey: string,
  _tableId: string
): Promise<EnrichmentData | null> {
  return null;
}

