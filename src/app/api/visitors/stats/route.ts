import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [
      total,
      qualified,
      disqualified,
      syncedToSf,
      personCount,
      companyCount,
    ] = await Promise.all([
      prisma.visitor.count(),
      prisma.visitor.count({ where: { status: "QUALIFIED" } }),
      prisma.visitor.count({ where: { status: "DISQUALIFIED" } }),
      prisma.visitor.count({ where: { status: "SYNCED_TO_SF" } }),
      prisma.visitor.count({ where: { profileType: "Person" } }),
      prisma.visitor.count({ where: { profileType: "Company" } }),
    ]);

    return NextResponse.json({
      total,
      qualified,
      disqualified,
      syncedToSf,
      personCount,
      companyCount,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
