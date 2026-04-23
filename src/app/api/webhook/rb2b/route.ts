import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseRB2BWebhookPayload } from "@/lib/webhook/rb2b-parser";
import { processVisitor } from "@/lib/pipeline/process-visitor";
import { RB2BWebhookPayload } from "@/types/rb2b";

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    const payload: RB2BWebhookPayload = await request.json();

    // Parse and normalize — returns null for Company/Website profiles
    const normalized = parseRB2BWebhookPayload(payload);

    if (!normalized) {
      // Company/Website-level profile — skip, only process Person profiles
      console.log("[Webhook] Skipping Company/Website profile (no person name)");
      return NextResponse.json(
        { status: "skipped", reason: "Company profile — only Person profiles are captured" },
        { status: 200 }
      );
    }

    // Dedup: check if same email was processed within 30 minutes
    if (normalized.email) {
      const recentVisitor = await prisma.visitor.findFirst({
        where: {
          email: normalized.email,
          createdAt: {
            gte: new Date(Date.now() - DEDUP_WINDOW_MS),
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentVisitor) {
        // Append new PageVisit for this URL
        if (normalized.pageUrls.length > 0) {
          await prisma.pageVisit.createMany({
            data: normalized.pageUrls.map((url) => ({
              visitorId: recentVisitor.id,
              url,
              referrer: normalized.referrer,
              seenAt: normalized.lastSeenAt ?? new Date(),
            })),
          });

          await prisma.visitor.update({
            where: { id: recentVisitor.id },
            data: {
              allTimePageViews: {
                increment: normalized.pageUrls.length,
              },
              lastSeenAt: normalized.lastSeenAt ?? new Date(),
            },
          });
        }

        return NextResponse.json(
          { status: "deduped", visitorId: recentVisitor.id },
          { status: 200 }
        );
      }
    }

    // Create new Visitor
    const visitor = await prisma.visitor.create({
      data: {
        email: normalized.email,
        firstName: normalized.firstName,
        lastName: normalized.lastName,
        title: normalized.title,
        companyName: normalized.companyName,
        linkedinUrl: normalized.linkedinUrl,
        website: normalized.website,
        industry: normalized.industry,
        employeeCount: normalized.employeeCount,
        estimatedRevenue: normalized.estimatedRevenue,
        city: normalized.city,
        state: normalized.state,
        zipcode: normalized.zipcode,
        profileType: normalized.profileType,
        tags: normalized.tags,
        filterMatches: normalized.filterMatches,
        allTimePageViews: normalized.allTimePageViews,
        isNewProfile: normalized.isNewProfile,
        firstSeenAt: normalized.firstSeenAt,
        lastSeenAt: normalized.lastSeenAt ?? new Date(),
        source: "webhook",
        rawPayload: JSON.parse(JSON.stringify(payload)),
        pageVisits: {
          create: normalized.pageUrls.map((url) => ({
            url,
            referrer: normalized.referrer,
            seenAt: normalized.lastSeenAt ?? new Date(),
          })),
        },
      },
    });

    // Fire-and-forget: trigger pipeline processing
    processVisitor(visitor.id).catch((err) => {
      console.error(
        `[Webhook] Background pipeline failed for visitor ${visitor.id}:`,
        err
      );
    });

    return NextResponse.json(
      { status: "ok", visitorId: visitor.id },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Webhook] Error processing RB2B webhook:", error);
    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
