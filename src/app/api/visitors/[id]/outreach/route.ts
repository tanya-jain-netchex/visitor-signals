import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateOutreachEmail } from "@/lib/email/generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const messages = await prisma.outreachMessage.findMany({
      where: { visitorId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Failed to fetch outreach messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch outreach messages" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const visitor = await prisma.visitor.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!visitor) {
      return NextResponse.json(
        { error: "Visitor not found" },
        { status: 404 }
      );
    }

    // Check LLM is configured before we pretend to generate
    const [llmKey, llmEnabled] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: "llm_api_key" } }),
      prisma.appSetting.findUnique({ where: { key: "llm_enabled" } }),
    ]);
    if (!llmKey?.value || !llmEnabled?.enabled) {
      return NextResponse.json(
        {
          error:
            "LLM provider not configured. Add an API key and enable it in Settings → LLM Provider.",
        },
        { status: 400 }
      );
    }

    const result = await generateOutreachEmail(id);
    if (!result) {
      return NextResponse.json(
        {
          error:
            "Email generation failed — LLM returned no usable output. Check server logs for the provider response.",
        },
        { status: 502 }
      );
    }

    // generateOutreachEmail already persisted an OutreachMessage row; return the
    // latest one so the UI can refresh without a second fetch.
    const latest = await prisma.outreachMessage.findFirst({
      where: { visitorId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      message: latest,
      subject: result.subject,
      body: result.body,
    });
  } catch (error) {
    console.error("Failed to trigger outreach generation:", error);
    return NextResponse.json(
      { error: "Failed to trigger outreach generation" },
      { status: 500 }
    );
  }
}
