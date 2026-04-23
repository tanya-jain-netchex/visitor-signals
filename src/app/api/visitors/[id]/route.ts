import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const visitor = await prisma.visitor.findUnique({
      where: { id },
      include: {
        pageVisits: {
          orderBy: { seenAt: "desc" },
        },
        enrichment: true,
        icpScore: true,
        sfSyncLogs: {
          orderBy: { syncedAt: "desc" },
        },
        outreachMessages: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!visitor) {
      return NextResponse.json(
        { error: "Visitor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ visitor });
  } catch (error) {
    console.error("Failed to fetch visitor:", error);
    return NextResponse.json(
      { error: "Failed to fetch visitor" },
      { status: 500 }
    );
  }
}
