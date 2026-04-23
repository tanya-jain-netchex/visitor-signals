import { RB2BWebhookPayload, RB2BCSVPayload, NormalizedVisitor } from "@/types/rb2b";

function parseJsonArray(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Comma-separated fallback
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function emptyToNull(value: string | undefined | null): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

/**
 * Parse the LIVE RB2B webhook payload (space-separated field names).
 * Returns null for Company/Website profiles (no First Name present).
 */
export function parseRB2BWebhookPayload(
  payload: RB2BWebhookPayload
): NormalizedVisitor | null {
  const firstName = emptyToNull(payload["First Name"]);
  const lastName = emptyToNull(payload["Last Name"]);

  // Detect profile type: if no first name it's a Company/Website-level profile
  // We only want Person profiles from the webhook
  const isPersonProfile = firstName !== null || lastName !== null;
  if (!isPersonProfile) {
    return null; // Caller should skip Company profiles
  }

  const capturedUrl = emptyToNull(payload["Captured URL"]);
  const seenAt = parseDate(payload["Seen At"]);

  return {
    email: emptyToNull(payload["Business Email"]),
    firstName,
    lastName,
    title: emptyToNull(payload["Title"]),
    companyName: emptyToNull(payload["Company Name"]),
    linkedinUrl: emptyToNull(payload["LinkedIn URL"]),
    website: emptyToNull(payload["Website"]),
    industry: emptyToNull(payload["Industry"]),
    employeeCount: emptyToNull(payload["Employee Count"]),
    estimatedRevenue: emptyToNull(payload["Estimate Revenue"]),
    city: emptyToNull(payload["City"]),
    state: emptyToNull(payload["State"]),
    zipcode: emptyToNull(payload["Zipcode"]),
    profileType: "Person",
    tags: parseJsonArray(payload["Tags"]),
    filterMatches: [],
    allTimePageViews: 1,
    isNewProfile: true,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    pageUrls: capturedUrl ? [capturedUrl] : [],
    referrer: emptyToNull(payload["Referrer"]),
  };
}

/**
 * Parse an RB2B CSV export row (PascalCase field names).
 * CSV rows can be Person or Company — no filtering here.
 */
export function parseRB2BCSVPayload(payload: RB2BCSVPayload): NormalizedVisitor {
  const pageUrls = parseJsonArray(payload.RecentPageUrls as string | string[]);
  const profileType = (payload.ProfileType || "Person") as "Person" | "Company";

  return {
    email: emptyToNull(payload.WorkEmail),
    firstName: emptyToNull(payload.FirstName),
    lastName: emptyToNull(payload.LastName),
    title: emptyToNull(payload.Title),
    companyName: emptyToNull(payload.CompanyName),
    linkedinUrl: emptyToNull(payload.LinkedInUrl),
    website: emptyToNull(payload.Website),
    industry: emptyToNull(payload.Industry),
    employeeCount: emptyToNull(payload.EstimatedEmployeeCount),
    estimatedRevenue: emptyToNull(payload.EstimateRevenue),
    city: emptyToNull(payload.City),
    state: emptyToNull(payload.State),
    zipcode: emptyToNull(payload.Zipcode),
    profileType,
    tags: parseJsonArray(payload.Tags as string | string[]),
    filterMatches: parseJsonArray(payload.FilterMatches as string | string[]),
    allTimePageViews: Number(payload.AllTimePageViews) || 1,
    isNewProfile:
      payload.NewProfile === true ||
      payload.NewProfile === "true" ||
      payload.NewProfile === "TRUE",
    firstSeenAt: parseDate(payload.FirstSeenAt),
    lastSeenAt: parseDate(payload.LastSeenAt),
    pageUrls,
    referrer: emptyToNull(payload.MostRecentReferrer),
  };
}

// Legacy export for backward compatibility with CSV route
export function parseRB2BPayload(payload: RB2BCSVPayload): NormalizedVisitor {
  return parseRB2BCSVPayload(payload);
}

/**
 * Maps CSV column headers (case-insensitive) to RB2BCSVPayload keys
 */
const COLUMN_MAP: Record<string, keyof RB2BCSVPayload> = {
  linkedinurl: "LinkedInUrl",
  linkedin_url: "LinkedInUrl",
  "linkedin url": "LinkedInUrl",
  firstname: "FirstName",
  first_name: "FirstName",
  "first name": "FirstName",
  lastname: "LastName",
  last_name: "LastName",
  "last name": "LastName",
  title: "Title",
  companyname: "CompanyName",
  company_name: "CompanyName",
  "company name": "CompanyName",
  alltimepageviews: "AllTimePageViews",
  "all time page views": "AllTimePageViews",
  workemail: "WorkEmail",
  work_email: "WorkEmail",
  "work email": "WorkEmail",
  email: "WorkEmail",
  "business email": "WorkEmail",
  website: "Website",
  industry: "Industry",
  estimatedemployeecount: "EstimatedEmployeeCount",
  "estimated employee count": "EstimatedEmployeeCount",
  employee_count: "EstimatedEmployeeCount",
  "employee count": "EstimatedEmployeeCount",
  estimaterevenue: "EstimateRevenue",
  estimated_revenue: "EstimateRevenue",
  "estimate revenue": "EstimateRevenue",
  city: "City",
  state: "State",
  zipcode: "Zipcode",
  zip_code: "Zipcode",
  lastseenat: "LastSeenAt",
  last_seen_at: "LastSeenAt",
  "last seen at": "LastSeenAt",
  "seen at": "LastSeenAt",
  firstseenat: "FirstSeenAt",
  first_seen_at: "FirstSeenAt",
  "first seen at": "FirstSeenAt",
  newprofile: "NewProfile",
  new_profile: "NewProfile",
  "new profile": "NewProfile",
  mostrecentreferrer: "MostRecentReferrer",
  most_recent_referrer: "MostRecentReferrer",
  "most recent referrer": "MostRecentReferrer",
  referrer: "MostRecentReferrer",
  recentpagecount: "RecentPageCount",
  recent_page_count: "RecentPageCount",
  "recent page count": "RecentPageCount",
  recentpageurls: "RecentPageUrls",
  recent_page_urls: "RecentPageUrls",
  "recent page urls": "RecentPageUrls",
  "captured url": "RecentPageUrls",
  tags: "Tags",
  filtermatches: "FilterMatches",
  filter_matches: "FilterMatches",
  "filter matches": "FilterMatches",
  profiletype: "ProfileType",
  profile_type: "ProfileType",
  "profile type": "ProfileType",
};

export function mapCSVRowToPayload(row: Record<string, string>): RB2BCSVPayload {
  const payload: Record<string, unknown> = {};

  for (const [csvCol, value] of Object.entries(row)) {
    const normalizedCol = csvCol.toLowerCase().trim();
    const mappedKey = COLUMN_MAP[normalizedCol];
    if (mappedKey) {
      payload[mappedKey] = value;
    }
  }

  return payload as RB2BCSVPayload;
}
