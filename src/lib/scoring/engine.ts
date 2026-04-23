import { prisma } from "@/lib/db";
import { checkDisqualifiers } from "./disqualifiers";
import { computeSoftScore, getTier } from "./rules";

export interface IcpScoreResult {
  totalScore: number;
  isQualified: boolean;
  tier: string;
  disqualifyReason: string | null;
  scoreBreakdown: Record<string, unknown>;
}

/**
 * Score a visitor against the active ICP configuration.
 * - Loads active IcpConfig from DB (falls back to defaults if none exists)
 * - Runs hard disqualifiers first
 * - Then runs soft scoring
 * - Creates/updates IcpScore record
 * - Updates visitor status to QUALIFIED or DISQUALIFIED
 */
export async function scoreVisitor(visitorId: string): Promise<IcpScoreResult> {
  // Load visitor with page visits
  const visitor = await prisma.visitor.findUniqueOrThrow({
    where: { id: visitorId },
    include: { pageVisits: true },
  });

  // Load active ICP config (if any)
  const icpConfig = await prisma.icpConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  // Parse config for disqualifiers
  const disqualifierConfig = icpConfig?.disqualifiers as
    | { freeDomains?: string[]; competitors?: string[]; internal?: string[] }
    | undefined;

  // Parse config for scoring rules
  const rulesConfig = icpConfig?.rules as
    | {
        targetIndustries?: { high: string[]; medium: string[] };
        highFitTitles?: string[];
        mediumFitTitles?: string[];
      }
    | undefined;

  const scoreThreshold = icpConfig?.scoreThreshold ?? 50;

  // Step 1: Hard disqualifiers
  const disqualifyResult = checkDisqualifiers(
    {
      email: visitor.email,
      linkedinUrl: visitor.linkedinUrl,
      profileType: visitor.profileType,
    },
    disqualifierConfig,
  );

  if (disqualifyResult.disqualified) {
    const result: IcpScoreResult = {
      totalScore: 0,
      isQualified: false,
      tier: "tier3",
      disqualifyReason: disqualifyResult.reason,
      scoreBreakdown: {
        firmographics: 0,
        intent: 0,
        persona: 0,
        capacity: 0,
        disqualified: true,
        reason: disqualifyResult.reason,
      },
    };

    // Persist score
    await prisma.icpScore.upsert({
      where: { visitorId },
      create: {
        visitorId,
        totalScore: 0,
        isQualified: false,
        tier: "tier3",
        disqualifyReason: disqualifyResult.reason,
        scoreBreakdown: JSON.parse(JSON.stringify(result.scoreBreakdown)),
      },
      update: {
        totalScore: 0,
        isQualified: false,
        tier: "tier3",
        disqualifyReason: disqualifyResult.reason,
        scoreBreakdown: JSON.parse(JSON.stringify(result.scoreBreakdown)),
        scoredAt: new Date(),
      },
    });

    // Update visitor status
    await prisma.visitor.update({
      where: { id: visitorId },
      data: { status: "DISQUALIFIED" },
    });

    return result;
  }

  // Step 2: Soft scoring
  const pageUrls = visitor.pageVisits.map((pv) => pv.url);
  const breakdown = computeSoftScore(
    {
      industry: visitor.industry,
      employeeCount: visitor.employeeCount,
      state: visitor.state,
      title: visitor.title,
      linkedinUrl: visitor.linkedinUrl,
      estimatedRevenue: visitor.estimatedRevenue,
      allTimePageViews: visitor.allTimePageViews,
      pageUrls,
    },
    rulesConfig,
  );

  const totalScore =
    breakdown.firmographics + breakdown.intent + breakdown.persona + breakdown.capacity;

  const { tier, isQualified } = getTier(totalScore, scoreThreshold);

  const result: IcpScoreResult = {
    totalScore,
    isQualified,
    tier,
    disqualifyReason: null,
    scoreBreakdown: {
      firmographics: breakdown.firmographics,
      intent: breakdown.intent,
      persona: breakdown.persona,
      capacity: breakdown.capacity,
      details: breakdown.details,
    },
  };

  // Persist score
  await prisma.icpScore.upsert({
    where: { visitorId },
    create: {
      visitorId,
      totalScore,
      isQualified,
      tier,
      disqualifyReason: null,
      scoreBreakdown: JSON.parse(JSON.stringify(result.scoreBreakdown)),
    },
    update: {
      totalScore,
      isQualified,
      tier,
      disqualifyReason: null,
      scoreBreakdown: JSON.parse(JSON.stringify(result.scoreBreakdown)),
      scoredAt: new Date(),
    },
  });

  // Update visitor status
  const newStatus = isQualified ? "QUALIFIED" : "DISQUALIFIED";
  await prisma.visitor.update({
    where: { id: visitorId },
    data: { status: newStatus },
  });

  return result;
}
