import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Papa from "papaparse";
import {
  mapCSVRowToPayload,
  parseRB2BPayload,
} from "@/lib/webhook/rb2b-parser";
import { processVisitor } from "@/lib/pipeline/process-visitor";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No CSV file provided. Send a 'file' field with multipart form data." },
        { status: 400 },
      );
    }

    const csvText = await file.text();

    // Parse CSV
    const parseResult = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      return NextResponse.json(
        {
          error: "Failed to parse CSV",
          details: parseResult.errors.slice(0, 5),
        },
        { status: 400 },
      );
    }

    let importedCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];
      try {
        const payload = mapCSVRowToPayload(row);
        const normalized = parseRB2BPayload(payload);

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
            source: "csv",
            rawPayload: JSON.parse(JSON.stringify(payload)),
            pageVisits: {
              create: normalized.pageUrls.map((url) => ({
                url,
                referrer: normalized.referrer,
              })),
            },
          },
        });

        // Fire-and-forget: trigger pipeline for each visitor
        processVisitor(visitor.id).catch((err) => {
          console.error(
            `[CSV Import] Background pipeline failed for visitor ${visitor.id}:`,
            err,
          );
        });

        importedCount++;
      } catch (err) {
        errors.push({
          row: i + 2, // +2 because row 1 is header, data is 0-indexed
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      status: "ok",
      imported: importedCount,
      totalRows: parseResult.data.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    console.error("[CSV Import] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
