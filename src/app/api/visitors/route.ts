import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const profileType = searchParams.get("profileType");

    const where: Prisma.VisitorWhereInput = {};

    if (status && status !== "all") {
      where.status = status as Prisma.VisitorWhereInput["status"];
    }

    if (profileType && profileType !== "all") {
      where.profileType = profileType;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [visitors, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        include: {
          icpScore: {
            select: {
              totalScore: true,
              tier: true,
              isQualified: true,
            },
          },
          _count: {
            select: {
              pageVisits: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.visitor.count({ where }),
    ]);

    return NextResponse.json({
      visitors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch visitors:", error);
    return NextResponse.json(
      { error: "Failed to fetch visitors" },
      { status: 500 }
    );
  }
}
