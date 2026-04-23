import { parseEmployeeCount, parseRevenue } from "./parsers";
import { getMaxPageIntent } from "./page-intent";

export interface ScoreBreakdown {
  firmographics: number;
  intent: number;
  persona: number;
  capacity: number;
  details: {
    industryScore: number;
    companySizeScore: number;
    locationScore: number;
    pageIntentScore: number;
    intentBonusScore: number;
    titleScore: number;
    linkedinScore: number;
    revenueScore: number;
    multipleViewsScore: number;
  };
}

interface VisitorForScoring {
  industry: string | null;
  employeeCount: string | null;
  state: string | null;
  title: string | null;
  linkedinUrl: string | null;
  estimatedRevenue: string | null;
  allTimePageViews: number;
  pageUrls: string[];
}

interface ScoringConfig {
  targetIndustries?: {
    high: string[];
    medium: string[];
  };
  highFitTitles?: string[];
  mediumFitTitles?: string[];
}

// Default target industries for Netchex
export const DEFAULT_HIGH_FIT_INDUSTRIES = [
  "restaurants",
  "hospitality",
  "food & beverages",
  "food services",
  "staffing and recruiting",
  "construction",
  "healthcare",
  "hospital & health care",
  "retail",
  "manufacturing",
  "oil & energy",
  "oil & gas",
  "financial services",
  "accounting",
  "real estate",
  "nonprofit organization management",
  "religious institutions",
];

export const DEFAULT_MEDIUM_FIT_INDUSTRIES = [
  "information technology and services",
  "education management",
  "higher education",
  "government administration",
  "transportation/trucking/railroad",
  "logistics and supply chain",
  "automotive",
  "insurance",
  "legal services",
  "marketing and advertising",
  "professional services",
];

export const DEFAULT_HIGH_FIT_TITLES = [
  "hr manager",
  "human resources manager",
  "hr director",
  "human resources director",
  "payroll manager",
  "payroll administrator",
  "payroll admin",
  "payroll specialist",
  "payroll director",
  "vp hr",
  "vp human resources",
  "vp of hr",
  "vp of human resources",
  "vice president hr",
  "vice president human resources",
  "svp hr",
  "chief human resources officer",
  "chro",
  "cfo",
  "chief financial officer",
  "controller",
  "owner",
  "ceo",
  "chief executive officer",
  "president",
  "coo",
  "chief operating officer",
  "head of hr",
  "head of people",
  "head of human resources",
  "director of hr",
  "director of human resources",
  "people operations manager",
  "people ops manager",
];

export const DEFAULT_MEDIUM_FIT_TITLES = [
  "office manager",
  "office administrator",
  "benefits manager",
  "benefits administrator",
  "benefits coordinator",
  "compensation manager",
  "compensation and benefits",
  "talent acquisition",
  "recruiting manager",
  "hr generalist",
  "human resources generalist",
  "hr coordinator",
  "hr specialist",
  "hr business partner",
  "hrbp",
  "operations manager",
  "finance manager",
  "finance director",
  "bookkeeper",
  "accounting manager",
];

function normalizeForMatch(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Explode a list item into its constituent sub-tokens so that entries like
 * "transportation/trucking/railroad" match any of the three words, and
 * "logistics and supply chain" can be matched by a visitor industry string of
 * "Transportation and Logistics". Short connective words ("and", "of", etc.)
 * are filtered out to avoid false positives.
 */
const STOPWORDS = new Set([
  "and", "or", "of", "the", "for", "to", "a", "an", "in",
  "with", "on", "by", "&",
]);

function explode(item: string): string[] {
  return item
    .toLowerCase()
    .split(/[\/&,]+|\s{2,}/) // split on /, &, ,, or double-space
    .map((s) => s.trim())
    .filter((s) => s && !STOPWORDS.has(s) && s.length >= 3);
}

function matchesList(value: string | null, list: string[]): boolean {
  if (!value) return false;
  const normalized = normalizeForMatch(value);
  // Tokens from the visitor-provided value so multi-word values like
  // "Transportation and Logistics" can match list items containing either word.
  const valueTokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t) && t.length >= 3);

  return list.some((item) => {
    const itemNorm = normalizeForMatch(item);
    if (normalized === itemNorm) return true;
    if (normalized.includes(itemNorm) || itemNorm.includes(normalized)) return true;

    // Sub-token fallback: check if any exploded sub-token of the list item
    // appears as a substring of the visitor value OR vice-versa. This is what
    // lets "transportation/trucking/railroad" catch "Transportation and
    // Logistics" through the shared word "transportation".
    const subTokens = explode(item);
    return subTokens.some(
      (tok) =>
        normalized.includes(tok) ||
        valueTokens.some((vt) => vt === tok || vt.includes(tok) || tok.includes(vt)),
    );
  });
}

/**
 * Run soft scoring rules against a visitor. Returns a score out of 100.
 */
export function computeSoftScore(
  visitor: VisitorForScoring,
  config?: ScoringConfig,
): ScoreBreakdown {
  const highIndustries = config?.targetIndustries?.high ?? DEFAULT_HIGH_FIT_INDUSTRIES;
  const mediumIndustries = config?.targetIndustries?.medium ?? DEFAULT_MEDIUM_FIT_INDUSTRIES;
  const highTitles = config?.highFitTitles ?? DEFAULT_HIGH_FIT_TITLES;
  const mediumTitles = config?.mediumFitTitles ?? DEFAULT_MEDIUM_FIT_TITLES;

  // --- Firmographics (40 pts) ---

  // Industry match (20 pts)
  let industryScore = 0;
  if (matchesList(visitor.industry, highIndustries)) {
    industryScore = 20;
  } else if (matchesList(visitor.industry, mediumIndustries)) {
    industryScore = 10;
  }

  // Company size (10 pts)
  let companySizeScore = 0;
  const employeeCount = parseEmployeeCount(visitor.employeeCount);
  if (employeeCount >= 50 && employeeCount <= 500) {
    companySizeScore = 10;
  } else if (employeeCount >= 10 && employeeCount <= 1000) {
    companySizeScore = 5;
  }

  // US location (10 pts)
  const locationScore = visitor.state ? 10 : 0;

  const firmographics = industryScore + companySizeScore + locationScore;

  // --- Intent (30 pts) ---

  // Page intent (20 pts) — take max across all pages
  const intentResult = getMaxPageIntent(visitor.pageUrls);
  const pageIntentScore = Math.min(intentResult.score, 20);

  // Intent bonus (10 pts) — if visitor hit pricing or request-demo
  const hasHighIntentPage = visitor.pageUrls.some((url) => {
    const lower = url.toLowerCase();
    return lower.includes("/pricing") || lower.includes("/request-demo");
  });
  const intentBonusScore = hasHighIntentPage ? 10 : 0;

  const intent = pageIntentScore + intentBonusScore;

  // --- Persona Fit (20 pts) ---

  // Title match (15 pts)
  let titleScore = 0;
  if (matchesList(visitor.title, highTitles)) {
    titleScore = 15;
  } else if (matchesList(visitor.title, mediumTitles)) {
    titleScore = 8;
  }

  // Has LinkedIn (5 pts)
  const linkedinScore = visitor.linkedinUrl ? 5 : 0;

  const persona = titleScore + linkedinScore;

  // --- Capacity (10 pts) ---

  // Revenue (5 pts)
  let revenueScore = 0;
  const revenue = parseRevenue(visitor.estimatedRevenue);
  if (revenue >= 5_000_000 && revenue <= 50_000_000) {
    revenueScore = 5;
  } else if (revenue >= 1_000_000 && revenue <= 5_000_000) {
    revenueScore = 3;
  }

  // Multiple page views (5 pts)
  const multipleViewsScore = visitor.allTimePageViews > 1 ? 5 : 0;

  const capacity = revenueScore + multipleViewsScore;

  return {
    firmographics,
    intent,
    persona,
    capacity,
    details: {
      industryScore,
      companySizeScore,
      locationScore,
      pageIntentScore,
      intentBonusScore,
      titleScore,
      linkedinScore,
      revenueScore,
      multipleViewsScore,
    },
  };
}

/**
 * Determine tier from total score.
 *
 * `qualifiedThreshold` is the cutoff above which a visitor is QUALIFIED
 * (tier2). Tier1 ("immediate outreach") is still anchored at 75 so that
 * lowering the qualified threshold doesn't flood the top tier — both cutoffs
 * move together only if the user raises the threshold above 75.
 */
export function getTier(
  totalScore: number,
  qualifiedThreshold = 50,
): { tier: string; isQualified: boolean } {
  const tier1Cutoff = Math.max(75, qualifiedThreshold);
  if (totalScore >= tier1Cutoff) {
    return { tier: "tier1", isQualified: true };
  }
  if (totalScore >= qualifiedThreshold) {
    return { tier: "tier2", isQualified: true };
  }
  return { tier: "tier3", isQualified: false };
}
