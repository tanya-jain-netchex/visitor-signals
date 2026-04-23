import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

const connectionString = process.env.DATABASE_URL || "postgresql://netchex:netchex_dev@localhost:5432/netchex_leads";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Default ICP configuration based on Netchex TAM analysis
const DEFAULT_ICP_CONFIG = {
  name: "default",
  scoreThreshold: 60,
  rules: {
    firmographics: {
      weight: 40,
      industry: {
        maxPoints: 20,
        highFit: [
          "Hospitality",
          "Healthcare",
          "Manufacturing",
          "Restaurants",
          "Hotels",
          "Auto Dealerships",
          "Banking",
          "Financial Services",
          "Education",
          "Retail",
          "Food & Beverage",
          "Health and Pharmaceuticals",
          "Accommodation and Food Services",
        ],
        mediumFit: [
          "Construction",
          "Transportation and Logistics",
          "Professional and Business Services",
          "Government and Public Administration",
        ],
      },
      companySize: {
        maxPoints: 10,
        idealRange: { min: 50, max: 500 },
        acceptableRange: { min: 10, max: 1000 },
      },
      location: {
        maxPoints: 10,
        targetCountry: "US",
      },
    },
    intent: {
      weight: 30,
      pageIntent: {
        maxPoints: 20,
        veryHigh: ["/pricing", "/request-demo", "/contact"],
        high: [
          "/solutions/payroll-tax",
          "/solutions/time-attendance",
          "/solutions/benefits-administration",
          "/solutions/recruit",
          "/payroll-buyers-guide",
          "/payroll",
        ],
        medium: [
          "/solutions/human-resources",
          "/performance-management-software",
          "/solutions/learning-management",
          "/solutions/onboarding-software",
          "/solutions/employee-engagement",
          "/solutions",
          "/hr",
          "/onboarding",
          "/time-tracking",
          "/hospitality",
          "/benefits",
          "/compliance",
        ],
        low: ["/blog", "/case-studies", "/about-us", "/"],
      },
      techStack: {
        maxPoints: 10,
      },
    },
    personaFit: {
      weight: 20,
      titles: {
        maxPoints: 15,
        highFit: [
          "HR Manager",
          "HR Director",
          "Payroll Manager",
          "Payroll Admin",
          "VP of HR",
          "VP HR",
          "Operations Director",
          "CFO",
          "Controller",
          "COO",
          "Owner",
          "President",
          "People Operations",
          "Director of Human Resources",
          "Chief People Officer",
        ],
        mediumFit: [
          "Office Manager",
          "Benefits Manager",
          "Recruiting Manager",
          "Talent Acquisition",
          "General Manager",
          "Administrator",
        ],
      },
    },
    capacity: {
      weight: 10,
      revenue: {
        maxPoints: 5,
        idealRange: "$5M - $50M",
      },
      multiLocation: {
        maxPoints: 5,
      },
    },
  },
  disqualifiers: {
    freeDomains: [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "aol.com",
      "comcast.net",
      "icloud.com",
      "me.com",
      "live.com",
      "msn.com",
      "att.net",
      "sbcglobal.net",
      "verizon.net",
      "protonmail.com",
      "mail.com",
      "ymail.com",
      "rocketmail.com",
    ],
    competitors: [
      "paychex.com",
      "paycom.com",
      "paylocity.com",
      "adp.com",
      "kronos.com",
      "ukg.com",
      "ceridian.com",
      "dayforce.com",
      "gusto.com",
      "rippling.com",
      "bamboohr.com",
      "namely.com",
      "workday.com",
      "ultimatesoftware.com",
    ],
    internal: ["netchex.com"],
  },
};

async function seedIcpConfig() {
  const existing = await prisma.icpConfig.findFirst({
    where: { isActive: true },
  });

  if (!existing) {
    await prisma.icpConfig.create({
      data: {
        name: DEFAULT_ICP_CONFIG.name,
        scoreThreshold: DEFAULT_ICP_CONFIG.scoreThreshold,
        rules: JSON.parse(JSON.stringify(DEFAULT_ICP_CONFIG.rules)),
        disqualifiers: JSON.parse(JSON.stringify(DEFAULT_ICP_CONFIG.disqualifiers)),
        isActive: true,
      },
    });
    console.log("Seeded default ICP config");
  } else {
    console.log("ICP config already exists, skipping");
  }
}

interface CSVRow {
  [key: string]: string;
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emptyToNull(value: string | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function seedVisitorsFromCSV() {
  const csvPath = path.join(__dirname, "seed-data", "rb2b-export.csv");

  if (!fs.existsSync(csvPath)) {
    console.log("No seed CSV found at", csvPath, "— skipping visitor seed");
    return;
  }

  const existingCount = await prisma.visitor.count();
  if (existingCount > 0) {
    console.log(`${existingCount} visitors already exist, skipping CSV seed`);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const { data } = Papa.parse<CSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`Importing ${data.length} visitors from CSV...`);

  let imported = 0;
  let skipped = 0;

  for (const row of data) {
    try {
      const pageUrls = parseJsonArray(row.RecentPageUrls);

      const visitor = await prisma.visitor.create({
        data: {
          email: emptyToNull(row.WorkEmail),
          firstName: emptyToNull(row.FirstName),
          lastName: emptyToNull(row.LastName),
          title: emptyToNull(row.Title),
          companyName: emptyToNull(row.CompanyName),
          linkedinUrl: emptyToNull(row.LinkedInUrl),
          website: emptyToNull(row.Website),
          industry: emptyToNull(row.Industry),
          employeeCount: emptyToNull(row.EstimatedEmployeeCount),
          estimatedRevenue: emptyToNull(row.EstimateRevenue),
          city: emptyToNull(row.City),
          state: emptyToNull(row.State),
          zipcode: emptyToNull(row.Zipcode),
          profileType: row.ProfileType || "Person",
          tags: parseJsonArray(row.Tags),
          filterMatches: parseJsonArray(row.FilterMatches),
          allTimePageViews: Number(row.AllTimePageViews) || 1,
          isNewProfile: row.NewProfile === "true",
          firstSeenAt: parseDate(row.FirstSeenAt),
          lastSeenAt: parseDate(row.LastSeenAt),
          status: "NEW",
          source: "csv",
          rawPayload: JSON.parse(JSON.stringify(row)),
        },
      });

      // Create page visit records
      for (const url of pageUrls) {
        await prisma.pageVisit.create({
          data: {
            visitorId: visitor.id,
            url: url,
            referrer: emptyToNull(row.MostRecentReferrer),
            seenAt: parseDate(row.FirstSeenAt) || new Date(),
          },
        });
      }

      imported++;
    } catch (err) {
      skipped++;
      if (skipped <= 3) {
        console.warn(`Skipped row: ${(err as Error).message}`);
      }
    }
  }

  console.log(`Imported ${imported} visitors, skipped ${skipped}`);
}

async function main() {
  console.log("Starting seed...");
  await seedIcpConfig();
  await seedVisitorsFromCSV();
  console.log("Seed complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
