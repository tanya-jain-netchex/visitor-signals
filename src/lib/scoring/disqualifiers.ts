import { getEmailDomain } from "./parsers";

export const DEFAULT_FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "comcast.net",
  "aol.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "att.net",
  "yahoo.co.uk",
  "hotmail.co.uk",
  "mail.com",
  "protonmail.com",
  "zoho.com",
  "ymail.com",
  "me.com",
  "mac.com",
  "inbox.com",
  "gmx.com",
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "comcast.net",
  "aol.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "att.net",
  "yahoo.co.uk",
  "hotmail.co.uk",
  "mail.com",
  "protonmail.com",
  "zoho.com",
  "ymail.com",
  "me.com",
  "mac.com",
  "inbox.com",
  "gmx.com",
]);

export const DEFAULT_COMPETITOR_DOMAINS = [
  "paychex.com",
  "paycom.com",
  "paylocity.com",
  "adp.com",
  "kronos.com",
  "ukg.com",
  "ceridian.com",
  "gusto.com",
  "rippling.com",
  "bamboohr.com",
  "workday.com",
];

const COMPETITOR_DOMAINS = new Set(DEFAULT_COMPETITOR_DOMAINS);

export const DEFAULT_INTERNAL_DOMAINS = ["netchex.com"];

const INTERNAL_DOMAINS = new Set(DEFAULT_INTERNAL_DOMAINS);

interface DisqualifyResult {
  disqualified: boolean;
  reason: string | null;
}

interface VisitorForDisqualification {
  email: string | null;
  linkedinUrl: string | null;
  profileType: string;
}

/**
 * Run hard disqualifiers against a visitor.
 * If ANY disqualifier matches, the visitor is disqualified with score 0.
 */
export function checkDisqualifiers(
  visitor: VisitorForDisqualification,
  config?: { freeDomains?: string[]; competitors?: string[]; internal?: string[] },
): DisqualifyResult {
  // 1. Company profiles are not scored
  if (visitor.profileType === "Company") {
    return { disqualified: true, reason: "Company profile (not a person)" };
  }

  // 2. Unreachable: no email AND no LinkedIn
  if (!visitor.email && !visitor.linkedinUrl) {
    return { disqualified: true, reason: "No email and no LinkedIn URL (unreachable)" };
  }

  // Check email-based disqualifiers
  if (visitor.email) {
    const domain = getEmailDomain(visitor.email);

    if (!domain) {
      // Invalid email format — not a disqualifier on its own if they have LinkedIn
      if (!visitor.linkedinUrl) {
        return { disqualified: true, reason: "Invalid email and no LinkedIn URL" };
      }
    }

    // Build domain sets from config or use defaults
    const freeDomains = config?.freeDomains
      ? new Set(config.freeDomains.map((d) => d.toLowerCase()))
      : FREE_EMAIL_DOMAINS;

    const competitorDomains = config?.competitors
      ? new Set(config.competitors.map((d) => d.toLowerCase()))
      : COMPETITOR_DOMAINS;

    const internalDomains = config?.internal
      ? new Set(config.internal.map((d) => d.toLowerCase()))
      : INTERNAL_DOMAINS;

    // 3. Free email domain — only disqualify if there's no LinkedIn URL to enrich from
    // RB2B often sends personal emails; if they have LinkedIn we can get their work email via enrichment
    if (freeDomains.has(domain) && !visitor.linkedinUrl) {
      return { disqualified: true, reason: `Free email domain: ${domain} (no LinkedIn URL to enrich)` };
    }

    // 4. Competitor domain
    if (competitorDomains.has(domain)) {
      return { disqualified: true, reason: `Competitor domain: ${domain}` };
    }

    // 5. Internal domain
    if (internalDomains.has(domain)) {
      return { disqualified: true, reason: `Internal domain: ${domain}` };
    }
  }

  return { disqualified: false, reason: null };
}
