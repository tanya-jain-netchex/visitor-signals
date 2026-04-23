interface PageIntentResult {
  score: number;
  level: "very_high" | "high" | "medium" | "low" | "none";
  product?: string;
}

interface IntentPattern {
  pattern: RegExp;
  score: number;
  level: PageIntentResult["level"];
  product?: string;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Very High intent (20 pts)
  { pattern: /\/pricing/i, score: 20, level: "very_high", product: "payroll" },
  {
    pattern: /\/request-demo/i,
    score: 20,
    level: "very_high",
  },
  { pattern: /\/contact/i, score: 20, level: "very_high" },

  // High intent (15 pts)
  {
    pattern: /\/solutions\/payroll-tax/i,
    score: 15,
    level: "high",
    product: "payroll",
  },
  {
    pattern: /\/solutions\/time-attendance/i,
    score: 15,
    level: "high",
    product: "time-attendance",
  },
  {
    pattern: /\/solutions\/benefits-administration/i,
    score: 15,
    level: "high",
    product: "hr-suite",
  },
  {
    pattern: /\/solutions\/recruit/i,
    score: 15,
    level: "high",
    product: "hr-suite",
  },
  {
    pattern: /\/payroll-buyers-guide/i,
    score: 15,
    level: "high",
    product: "payroll",
  },
  { pattern: /\/payroll(?:\/|$)/i, score: 15, level: "high", product: "payroll" },

  // Medium intent (10 pts)
  {
    pattern: /\/solutions\/human-resources/i,
    score: 10,
    level: "medium",
    product: "hr-suite",
  },
  {
    pattern: /\/solutions\/learning-management/i,
    score: 10,
    level: "medium",
    product: "hr-suite",
  },
  {
    pattern: /\/solutions\/onboarding-software/i,
    score: 10,
    level: "medium",
    product: "hr-suite",
  },
  {
    pattern: /\/solutions\/employee-engagement/i,
    score: 10,
    level: "medium",
    product: "hr-suite",
  },
  {
    pattern: /\/time-tracking/i,
    score: 10,
    level: "medium",
    product: "time-attendance",
  },
  {
    pattern: /\/hospitality/i,
    score: 10,
    level: "medium",
    product: "payroll",
  },
  {
    pattern: /\/benefits(?:\/|$)/i,
    score: 10,
    level: "medium",
    product: "hr-suite",
  },
  {
    pattern: /\/compliance/i,
    score: 10,
    level: "medium",
    product: "compliance",
  },

  // Low intent (3 pts)
  { pattern: /\/blog/i, score: 3, level: "low" },
  { pattern: /\/case-studies/i, score: 3, level: "low" },
  { pattern: /\/about-us/i, score: 3, level: "low" },
  { pattern: /^\/?$/, score: 3, level: "low" },
];

/**
 * Determine intent score and level from a page URL.
 * Extracts the pathname from the URL and matches against known patterns.
 */
export function getPageIntentScore(url: string): PageIntentResult {
  let pathname: string;
  try {
    // Handle full URLs and path-only strings
    if (url.startsWith("http")) {
      pathname = new URL(url).pathname;
    } else {
      pathname = url.startsWith("/") ? url : `/${url}`;
    }
  } catch {
    pathname = url;
  }

  // Remove trailing slash for consistent matching (except root)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  for (const { pattern, score, level, product } of INTENT_PATTERNS) {
    if (pattern.test(pathname)) {
      return { score, level, product };
    }
  }

  return { score: 0, level: "none" };
}

/**
 * Get the maximum intent score across multiple page URLs.
 */
export function getMaxPageIntent(urls: string[]): PageIntentResult & { products: string[] } {
  const products = new Set<string>();
  let best: PageIntentResult = { score: 0, level: "none" };

  for (const url of urls) {
    const result = getPageIntentScore(url);
    if (result.product) {
      products.add(result.product);
    }
    if (result.score > best.score) {
      best = result;
    }
  }

  return { ...best, products: Array.from(products) };
}
