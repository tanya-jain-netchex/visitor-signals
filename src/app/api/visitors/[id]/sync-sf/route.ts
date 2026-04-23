import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getSalesforceConfig,
  syncVisitorToSalesforce,
} from "@/lib/salesforce/client";

/**
 * POST /api/visitors/[id]/sync-sf
 *
 * Syncs a visitor to Salesforce via the refresh-token OAuth flow:
 *   - Dedups by email (existing Lead or Contact → create Activity)
 *   - New prospect → create a Lead with tier-based Status (Tier 1 = SQL, else MQL)
 *
 * Fails loudly with the Salesforce error string in `error` so the UI can
 * surface it. The visitor detail page alerts the `error` field on non-2xx.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const visitor = await prisma.visitor.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!visitor) {
    return NextResponse.json({ error: "Visitor not found" }, { status: 404 });
  }
  if (!visitor.email) {
    return NextResponse.json(
      { error: "Visitor has no email — cannot sync to Salesforce" },
      { status: 400 },
    );
  }

  const sfConfig = await getSalesforceConfig();
  if (!sfConfig) {
    return NextResponse.json(
      {
        error:
          "Salesforce is not configured or enabled in Settings (needs Instance URL, Client ID, Client Secret, and Refresh Token).",
      },
      { status: 400 },
    );
  }

  try {
    const result = await syncVisitorToSalesforce(id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/visitors/${id}/sync-sf] sync failed:`, msg);

    // Persist the failure so the SfSyncLog has both successful and failed runs.
    try {
      await prisma.sfSyncLog.create({
        data: {
          visitorId: id,
          action: "sync_failed",
          sfObjectId: null,
          status: "error",
          errorMsg: msg.slice(0, 500),
        },
      });
    } catch {
      /* secondary logging should never mask the real error */
    }

    return NextResponse.json(
      { error: `Salesforce sync failed: ${msg}` },
      { status: 502 },
    );
  }
}
