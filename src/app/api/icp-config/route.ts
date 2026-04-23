import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  DEFAULT_HIGH_FIT_INDUSTRIES,
  DEFAULT_MEDIUM_FIT_INDUSTRIES,
  DEFAULT_HIGH_FIT_TITLES,
  DEFAULT_MEDIUM_FIT_TITLES,
} from "@/lib/scoring/rules";
import {
  DEFAULT_FREE_EMAIL_DOMAINS,
  DEFAULT_COMPETITOR_DOMAINS,
  DEFAULT_INTERNAL_DOMAINS,
} from "@/lib/scoring/disqualifiers";

/**
 * ICP scoring rules admin endpoint.
 *
 * The scoring engine (src/lib/scoring/engine.ts) reads the active IcpConfig
 * with this exact shape:
 *   - rules.targetIndustries.high / medium  (string[])
 *   - rules.highFitTitles / mediumFitTitles (string[])
 *   - disqualifiers.freeDomains / competitors / internal (string[])
 *
 * If no fields are present, the engine falls back to the DEFAULT_* constants
 * exported from rules.ts and disqualifiers.ts. This route always returns an
 * effective config (DB or defaults), and always writes in the shape above
 * so saved changes actually take effect without a code change.
 */

interface IcpConfigShape {
  scoreThreshold: number;
  rules: {
    targetIndustries: { high: string[]; medium: string[] };
    highFitTitles: string[];
    mediumFitTitles: string[];
  };
  disqualifiers: {
    freeDomains: string[];
    competitors: string[];
    internal: string[];
  };
}

function dedupeClean(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function buildEffectiveConfig(
  stored: Record<string, unknown> | null,
  stored_disq: Record<string, unknown> | null,
  threshold: number | null
): IcpConfigShape {
  const rules = (stored ?? {}) as {
    targetIndustries?: { high?: unknown; medium?: unknown };
    highFitTitles?: unknown;
    mediumFitTitles?: unknown;
  };
  const disq = (stored_disq ?? {}) as {
    freeDomains?: unknown;
    competitors?: unknown;
    internal?: unknown;
  };

  return {
    scoreThreshold: threshold ?? 50,
    rules: {
      targetIndustries: {
        high:
          dedupeClean(rules.targetIndustries?.high).length > 0
            ? dedupeClean(rules.targetIndustries?.high)
            : [...DEFAULT_HIGH_FIT_INDUSTRIES],
        medium:
          dedupeClean(rules.targetIndustries?.medium).length > 0
            ? dedupeClean(rules.targetIndustries?.medium)
            : [...DEFAULT_MEDIUM_FIT_INDUSTRIES],
      },
      highFitTitles:
        dedupeClean(rules.highFitTitles).length > 0
          ? dedupeClean(rules.highFitTitles)
          : [...DEFAULT_HIGH_FIT_TITLES],
      mediumFitTitles:
        dedupeClean(rules.mediumFitTitles).length > 0
          ? dedupeClean(rules.mediumFitTitles)
          : [...DEFAULT_MEDIUM_FIT_TITLES],
    },
    disqualifiers: {
      freeDomains:
        dedupeClean(disq.freeDomains).length > 0
          ? dedupeClean(disq.freeDomains)
          : [...DEFAULT_FREE_EMAIL_DOMAINS],
      competitors:
        dedupeClean(disq.competitors).length > 0
          ? dedupeClean(disq.competitors)
          : [...DEFAULT_COMPETITOR_DOMAINS],
      internal:
        dedupeClean(disq.internal).length > 0
          ? dedupeClean(disq.internal)
          : [...DEFAULT_INTERNAL_DOMAINS],
    },
  };
}

export async function GET() {
  const active = await prisma.icpConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const effective = buildEffectiveConfig(
    (active?.rules as Record<string, unknown>) ?? null,
    (active?.disqualifiers as Record<string, unknown>) ?? null,
    active?.scoreThreshold ?? null
  );

  return NextResponse.json({
    config: effective,
    hasStoredConfig: !!active,
    configId: active?.id ?? null,
    updatedAt: active?.updatedAt ?? null,
  });
}

export async function PUT(request: NextRequest) {
  let body: Partial<IcpConfigShape>;
  try {
    body = (await request.json()) as Partial<IcpConfigShape>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const threshold = Number.isFinite(body.scoreThreshold)
    ? Math.max(0, Math.min(100, Number(body.scoreThreshold)))
    : 50;

  const normalized: IcpConfigShape = {
    scoreThreshold: threshold,
    rules: {
      targetIndustries: {
        high: dedupeClean(body.rules?.targetIndustries?.high),
        medium: dedupeClean(body.rules?.targetIndustries?.medium),
      },
      highFitTitles: dedupeClean(body.rules?.highFitTitles),
      mediumFitTitles: dedupeClean(body.rules?.mediumFitTitles),
    },
    disqualifiers: {
      freeDomains: dedupeClean(body.disqualifiers?.freeDomains).map((d) =>
        d.toLowerCase()
      ),
      competitors: dedupeClean(body.disqualifiers?.competitors).map((d) =>
        d.toLowerCase()
      ),
      internal: dedupeClean(body.disqualifiers?.internal).map((d) =>
        d.toLowerCase()
      ),
    },
  };

  // Deactivate any existing active configs, then create a new active one. We
  // create-new rather than update so the IcpScore records referencing prior
  // configs remain explainable historically (they still point at the old
  // rules via scoredAt timestamps).
  await prisma.icpConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  const created = await prisma.icpConfig.create({
    data: {
      name: "custom",
      scoreThreshold: normalized.scoreThreshold,
      rules: JSON.parse(JSON.stringify(normalized.rules)),
      disqualifiers: JSON.parse(JSON.stringify(normalized.disqualifiers)),
      isActive: true,
    },
  });

  return NextResponse.json({
    success: true,
    configId: created.id,
    config: normalized,
  });
}
