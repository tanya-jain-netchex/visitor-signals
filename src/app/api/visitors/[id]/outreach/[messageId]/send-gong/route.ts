import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  isLiveSendEnabled,
  sendViaGongLive,
  sendViaGongSimulated,
} from "@/lib/gong/client";

/**
 * POST /api/visitors/[id]/outreach/[messageId]/send-gong
 *
 * Routes to one of two paths depending on the `gong_live_send_enabled`
 * AppSetting toggle:
 *
 *   OFF (default)  → sendViaGongSimulated: writes "(simulated)" marker only,
 *                    never touches Gong. Safe for demos.
 *   ON             → sendViaGongLive: POSTs to /v2/flows/{flowId}/assignees
 *                    adding the prospect to the configured Gong Flow. Requires
 *                    `gong_default_flow_id` to be set in Settings.
 *
 * The response includes `simulated: true|false` so the UI can confirm which
 * path ran. Failures bubble Gong's error string back to the caller.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;

  const message = await prisma.outreachMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      subject: true,
      body: true,
      visitorId: true,
      sentAt: true,
      visitor: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      },
    },
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

  const [flowIdRow, flowNameRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "gong_default_flow_id" } }),
    prisma.appSetting.findUnique({ where: { key: "gong_default_flow_name" } }),
  ]);
  const flowId = flowIdRow?.value ? decrypt(flowIdRow.value) : null;
  const flowName = flowNameRow?.value ? decrypt(flowNameRow.value) : null;

  const liveMode = await isLiveSendEnabled();

  // LIVE path
  if (liveMode) {
    if (!message.visitor.email) {
      return NextResponse.json(
        { error: "Visitor has no email — cannot perform live Engage send." },
        { status: 400 },
      );
    }
    if (!flowId) {
      return NextResponse.json(
        {
          error:
            "Live send is enabled but no Gong Flow ID is configured. Set `gong_default_flow_id` in Settings, or disable live send.",
        },
        { status: 400 },
      );
    }
    try {
      const result = await sendViaGongLive({
        visitorId: id,
        flowId,
        email: message.visitor.email,
        firstName: message.visitor.firstName,
        lastName: message.visitor.lastName,
        companyName: message.visitor.companyName,
        subject: message.subject,
        body: message.body,
      });
      return NextResponse.json({
        success: true,
        simulated: false,
        sentAt: result.sentAt,
        flowAssignmentId: result.flowAssignmentId,
        flowId,
        flowName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[api/visitors/${id}/send-gong] live send failed:`,
        msg,
      );
      return NextResponse.json(
        { error: `Gong live send failed: ${msg}` },
        { status: 502 },
      );
    }
  }

  // SIMULATED path (default)
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
