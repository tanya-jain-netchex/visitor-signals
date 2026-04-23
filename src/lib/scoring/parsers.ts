/**
 * Parse an employee count range string to a midpoint number.
 * Examples: "51-200" → 125, "1001-5000" → 3000, "10000+" → 15000
 */
export function parseEmployeeCount(range: string | null | undefined): number {
  if (!range) return 0;

  const cleaned = range.replace(/,/g, "").trim();

  // Handle "X+" format
  const plusMatch = cleaned.match(/^(\d+)\+$/);
  if (plusMatch) {
    return Math.round(Number(plusMatch[1]) * 1.5);
  }

  // Handle "X-Y" format
  const rangeMatch = cleaned.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    return Math.round((low + high) / 2);
  }

  // Handle plain number
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse a revenue range string to a dollar amount.
 * Examples: "$5M - $10M" → 7500000, "Above $50M" → 75000000
 */
export function parseRevenue(range: string | null | undefined): number {
  if (!range) return 0;

  const cleaned = range.replace(/,/g, "").trim();

  // Helper: convert "$5M" or "$500K" to number
  function parseDollarAmount(s: string): number {
    const match = s.match(/\$?\s*([\d.]+)\s*(B|M|K)?/i);
    if (!match) return 0;
    const value = Number(match[1]);
    const unit = (match[2] || "").toUpperCase();
    if (unit === "B") return value * 1_000_000_000;
    if (unit === "M") return value * 1_000_000;
    if (unit === "K") return value * 1_000;
    return value;
  }

  // Handle "Above $XM" / "Over $XM"
  const aboveMatch = cleaned.match(/(?:above|over)\s+(\$[\d.]+\s*[BMK]?)/i);
  if (aboveMatch) {
    return Math.round(parseDollarAmount(aboveMatch[1]) * 1.5);
  }

  // Handle "Under $XM" / "Below $XM"
  const underMatch = cleaned.match(/(?:under|below)\s+(\$[\d.]+\s*[BMK]?)/i);
  if (underMatch) {
    return Math.round(parseDollarAmount(underMatch[1]) * 0.5);
  }

  // Handle "$XM - $YM" range
  const rangeMatch = cleaned.match(
    /(\$[\d.]+\s*[BMK]?)\s*[-–]\s*(\$[\d.]+\s*[BMK]?)/i,
  );
  if (rangeMatch) {
    const low = parseDollarAmount(rangeMatch[1]);
    const high = parseDollarAmount(rangeMatch[2]);
    return Math.round((low + high) / 2);
  }

  // Try parsing as a single dollar amount
  return parseDollarAmount(cleaned);
}

/**
 * Extract the domain from an email address.
 */
export function getEmailDomain(email: string | null | undefined): string {
  if (!email) return "";
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}
