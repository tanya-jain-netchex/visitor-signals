import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sendViaGongSimulated } from "@/lib/gong/client";

/**
 * POST /api/visitors/[id]/outreach/[messageId]/send-gong
 *
 * Simulated Gong Engage push. Marks the OutreachMessage as sent via Gong with
 * a "(simulated)" suffix and — if the visitor has been checked against Gong
 * already — annotates with the configured default Flow name. Never actually
 * calls Gong. This is intentional: the user wants to demo the integration
 * path without emailing real prospects.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;

  const message = await prisma.outreachMessage.findUnique({
    where: { id: messageId },
    select: { id: true, subject: true, body: true, visitorId: true, sentAt: true },
  });
  if (!message || message.visitorId !== id) {
    return NextResponse.json({ error: "Outreach message not found" }, { status: 404 });
  }
  if (message.sentAt) {
    return NextResponse.json(
      { error: "This message is already marked as sent" },
      { status: 409 },
    );
  }

  // Pull the configured default Flow ID/name if the user wired one up in
  // Settings. Not required — the simulator records "(simulated)" either way.
  const [flowIdRow, flowNameRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "gong_default_flow_id" } }),
    prisma.appSetting.findUnique({ where: { key: "gong_default_flow_name" } }),
  ]);
  const flowId = flowIdRow?.value ? decrypt(flowIdRow.value) : null;
  const flowName = flowNameRow?.value ? decrypt(flowNameRow.value) : null;

  const result = await sendViaGongSimulated({
    visitorId: id,
    flowId,
    flowName,
    subject: message.subject,
    body: message.body,
  });

  return NextResponse.json({
    success: true,
    simulated: true,
    sentAt: result.sentAt,
    flowId,
    flowName,
  });
}
