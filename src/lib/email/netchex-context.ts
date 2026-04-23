/**
 * Static Netchex product context used for LLM-based email generation.
 * Based on company analysis and product offerings documentation.
 */

export const NETCHEX_CONTEXT = {
  company: {
    name: "Netchex",
    website: "https://netchex.com",
    tagline: "Cloud-based HCM solutions for SMBs with hourly, deskless, and mobile workforces",
    stats: {
      clients: "7,500+",
      csat: "98%",
      adminTimeSaved: "16 hrs/week",
    },
    targetIndustries: [
      "Hospitality",
      "Healthcare",
      "Manufacturing",
      "Restaurants",
      "Hotels",
      "Auto Dealerships",
      "Retail",
      "Education",
    ],
  },

  products: {
    payroll: {
      name: "Payroll",
      benefits: [
        "Automated multi-state payroll",
        "ACA/FLSA auto-compliance",
        "Unlimited payroll runs",
        "Direct deposit",
        "$4/employee pricing",
      ],
      emailHook: "Simplify multi-state payroll in minutes",
      snippet:
        "Payroll headaches? Netchex handles ACA/FLSA compliance automatically — run unlimited payrolls for $4/employee.",
    },
    timeAttendance: {
      name: "Time & Attendance",
      benefits: [
        "Mobile clock in/out",
        "GPS geofencing (no buddy punching)",
        "Real-time scheduling",
        "Overtime alerts",
      ],
      emailHook: "End no-shows with geofencing time tracking",
      snippet:
        "Missed punches costing you? Employees clock in/out via mobile app with GPS verification. Real-time schedules prevent overtime surprises.",
    },
    hrSuite: {
      name: "HR Suite",
      benefits: [
        "Digital onboarding",
        "Performance management",
        "Benefits administration",
        "Day 1 productivity",
      ],
      emailHook: "Complete HR suite for hourly teams",
      snippet:
        "New hires? Digital onboarding gets them productive Day 1. Track performance, manage benefits — all in one dashboard.",
    },
    ewa: {
      name: "Earned Wage Access (EWA)",
      benefits: [
        "On-demand pay for employees",
        "25% turnover reduction",
        "No loans, no fees",
        "Instant earned wage access",
      ],
      emailHook: "Pay on demand: stop turnover now",
      snippet:
        "Employees need cash before payday? Netchex EWA lets them tap earned wages instantly — no loans, no fees.",
    },
    compliance: {
      name: "Compliance",
      benefits: [
        "Built-in ACA compliance",
        "FLSA labor law automation",
        "Auto tax filing",
        "Real-time regulatory updates",
      ],
      emailHook: "Never risk compliance fines again",
      snippet:
        "One wrong W-4 = $100s in penalties. Our platform auto-files everything correctly.",
    },
    reporting: {
      name: "Reporting & Analytics",
      benefits: [
        "Real-time dashboards",
        "Custom reports",
        "Labor cost analytics",
        "Overtime trend spotting",
      ],
      emailHook: "Payroll analytics at your fingertips",
      snippet:
        "See labor costs instantly. Spot overtime trends before they hit your P&L.",
    },
  },

  personas: {
    hrOpsManager: {
      name: "Sarah the Operations Manager",
      titles: ["HR Manager", "Payroll Admin", "Ops Director", "HR Director"],
      focusAreas: ["Time savings", "Compliance relief", "Geofencing", "Admin reduction"],
      tone: "Empathetic, solution-focused, reference 16 hrs/week savings",
    },
    ceoCfo: {
      name: "Chris the CEO/CFO",
      titles: ["Owner", "CEO", "CFO", "President", "COO", "Controller"],
      focusAreas: ["Cost control", "Simple pricing ($4/emp)", "ROI", "Retention"],
      tone: "Direct, ROI-focused, reference cost savings and turnover reduction",
    },
  },
};

/**
 * Map page URL paths to product interests for email personalization
 */
export function getProductFromPageUrl(url: string): keyof typeof NETCHEX_CONTEXT.products | null {
  const path = url.replace(/https?:\/\/[^/]+/, "").toLowerCase();

  if (path.includes("payroll") || path.includes("pricing")) return "payroll";
  if (path.includes("time") || path.includes("attendance") || path.includes("scheduling"))
    return "timeAttendance";
  if (path.includes("hr") || path.includes("human-resources") || path.includes("onboarding"))
    return "hrSuite";
  if (path.includes("benefit") || path.includes("ewa") || path.includes("retention"))
    return "ewa";
  if (path.includes("compliance") || path.includes("tax")) return "compliance";
  if (path.includes("report") || path.includes("analytics")) return "reporting";

  return null;
}

/**
 * Determine which buyer persona best matches the visitor's title
 */
export function matchPersona(
  title: string | null,
): "hrOpsManager" | "ceoCfo" | "hrOpsManager" {
  if (!title) return "hrOpsManager"; // default

  const lower = title.toLowerCase();

  const ceoPatterns = ["owner", "ceo", "cfo", "president", "coo", "controller", "chief"];
  if (ceoPatterns.some((p) => lower.includes(p))) return "ceoCfo";

  return "hrOpsManager";
}
