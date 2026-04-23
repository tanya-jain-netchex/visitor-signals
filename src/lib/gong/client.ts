import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Gong Public API v2 client.
 *
 * All endpoints documented at https://app.gong.io/settings/api/documentation.
 * Auth is HTTP Basic — username=Access Key, password=Access Key Secret.
 * Base URL is tenant-specific (e.g. https://us-12345.api.gong.io) and stored
 * in AppSetting `gong_base_url`.
 *
 * Hard limit worth flagging: the public API does NOT expose email body text.
 * `/v2/data-privacy/data-for-email-address` returns *references* to prior
 * emails (counts, timestamps, CRM links) but not the content itself. Tone
 * research therefore has to be done out-of-band (e.g. Claude + Gong MCP
 * session) — we only use this client to count prior touchpoints.
 */

interface GongConfig {
  accessKey: string;
  accessKeySecret: string;
  baseUrl: string; // no trailing slash
}

const REQUIRED_KEYS = [
  "gong_access_key",
  "gong_access_key_secret",
  "gong_base_url",
  "gong_enabled",
] as const;

/**
 * Feature flag — when this AppSetting is present AND .enabled=true, the
 * "Send via Gong Engage" button performs a REAL Engage send instead of the
 * default simulation. Off by default so the demo is safe. Toggle in Settings.
 */
export async function isLiveSendEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "gong_live_send_enabled" },
  });
  return Boolean(row?.enabled);
}

export async function getGongConfig(): Promise<GongConfig | null> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...REQUIRED_KEYS] } },
  });
  const map = new Map(settings.map((s) => [s.key, s]));

  const enabled = map.get("gong_enabled");
  if (!enabled?.enabled) return null;

  const ak = map.get("gong_access_key");
  const sk = map.get("gong_access_key_secret");
  const bu = map.get("gong_base_url");
  if (!ak?.value || !sk?.value || !bu?.value) return null;

  return {
    accessKey: decrypt(ak.value),
    accessKeySecret: decrypt(sk.value),
    baseUrl: decrypt(bu.value).replace(/\/$/, ""),
  };
}

export async function isGongConfigured(): Promise<boolean> {
  return (await getGongConfig()) !== null;
}

/**
 * Low-level fetch with Basic auth. Throws on non-2xx with the response body
 * attached so callers can surface Gong's error message.
 */
export async function gongFetch<T = unknown>(
  config: GongConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const auth = Buffer.from(
    `${config.accessKey}:${config.accessKeySecret}`,
  ).toString("base64");

  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    // Gong's rate limit is generous for these read endpoints but keep a sane
    // timeout so a hung tenant doesn't stall a visitor detail page.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gong ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }

  // Gong returns empty body on 204 for some endpoints.
  const text = await res.text();
  return (text ? JSON.parse(text) : ({} as T)) as T;
}

// ---------- CRM linkage ----------

interface CrmEntityMatch {
  sfObjectType: "Lead" | "Contact" | "Account";
  sfId: string;
  sfInstanceUrl: string;
}

/**
 * Look up the Salesforce object Gong has mapped for a given email.
 *
 * Gong's `/v2/crm/entities` endpoint lets you query by external CRM identifier.
 * We filter by email on the client side because Gong's filter DSL for this
 * endpoint requires entity IDs, not arbitrary fields — the email match happens
 * on the returned payload.
 *
 * Returns null if no linked SF object found.
 */
export async function lookupCrmByEmail(
  email: string,
): Promise<CrmEntityMatch | null> {
  const config = await getGongConfig();
  if (!config) return null;

  // Gong exposes an activity stats endpoint that includes CRM linkage —
  // cheaper than scanning /v2/crm/entities for large tenants.
  interface ActivityStatsResponse {
    customerData?: {
      crmEntitiesIds?: string[];
      objects?: Array<{
        objectType: "Lead" | "Contact" | "Account";
        objectId: string;
        systemUrl?: string;
      }>;
    };
  }

  try {
    const stats = await gongFetch<ActivityStatsResponse>(
      config,
      `/v2/data-privacy/data-for-email-address?emailAddress=${encodeURIComponent(email)}`,
    );
    const obj = stats.customerData?.objects?.[0];
    if (!obj?.objectId || !obj.systemUrl) return null;

    // systemUrl looks like https://netchex.my.salesforce.com/003...
    const instanceUrl = new URL(obj.systemUrl).origin;
    return {
      sfObjectType: obj.objectType,
      sfId: obj.objectId,
      sfInstanceUrl: instanceUrl,
    };
  } catch (err) {
    console.warn(`[Gong] lookupCrmByEmail failed for ${email}:`, err);
    return null;
  }
}

// ---------- Prior-activity counts ----------

interface PriorActivity {
  priorCallCount: number;
  priorEmailCount: number;
  lastTouchpointAt: Date | null;
}

export async function getPriorActivity(email: string): Promise<PriorActivity> {
  const empty: PriorActivity = {
    priorCallCount: 0,
    priorEmailCount: 0,
    lastTouchpointAt: null,
  };

  const config = await getGongConfig();
  if (!config) return empty;

  interface DataForEmailResponse {
    customerData?: {
      callsReferences?: Array<{ callStartTime: string }>;
      emailsReferences?: Array<{ emailSentTime: string }>;
    };
  }

  try {
    const data = await gongFetch<DataForEmailResponse>(
      config,
      `/v2/data-privacy/data-for-email-address?emailAddress=${encodeURIComponent(email)}`,
    );

    const calls = data.customerData?.callsReferences ?? [];
    const emails = data.customerData?.emailsReferences ?? [];

    const timestamps = [
      ...calls.map((c) => new Date(c.callStartTime).getTime()),
      ...emails.map((e) => new Date(e.emailSentTime).getTime()),
    ].filter((t) => Number.isFinite(t));

    return {
      priorCallCount: calls.length,
      priorEmailCount: emails.length,
      lastTouchpointAt: timestamps.length
        ? new Date(Math.max(...timestamps))
        : null,
    };
  } catch (err) {
    console.warn(`[Gong] getPriorActivity failed for ${email}:`, err);
    return empty;
  }
}

// ---------- Refresh cache on Visitor ----------

/**
 * Hit Gong once and persist SF linkage + touchpoint counts on the Visitor row.
 * Safe to call repeatedly — it overwrites the cache fields and bumps
 * `gongCheckedAt`. No-op (but still bumps timestamp) when Gong isn't
 * configured so the UI can distinguish "never checked" from "checked, no hit".
 */
export async function refreshVisitorGongCache(
  visitorId: string,
): Promise<void> {
  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    select: { id: true, email: true },
  });
  if (!visitor?.email) return;

  const [crm, activity] = await Promise.all([
    lookupCrmByEmail(visitor.email),
    getPriorActivity(visitor.email),
  ]);

  await prisma.visitor.update({
    where: { id: visitorId },
    data: {
      sfObjectType: crm?.sfObjectType ?? null,
      sfId: crm?.sfId ?? null,
      sfInstanceUrl: crm?.sfInstanceUrl ?? null,
      priorCallCount: activity.priorCallCount,
      priorEmailCount: activity.priorEmailCount,
      lastTouchpointAt: activity.lastTouchpointAt,
      gongCheckedAt: new Date(),
    },
  });
}

// ---------- Engage Flows (listing + dry-run send) ----------

export interface GongFlow {
  id: string;
  name: string;
  status?: string;
}

export async function listFlows(): Promise<GongFlow[]> {
  const config = await getGongConfig();
  if (!config) return [];

  interface FlowsResponse {
    flows?: Array<{ id: string; name: string; status?: string }>;
  }

  try {
    const data = await gongFetch<FlowsResponse>(config, "/v2/flows");
    return (data.flows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
    }));
  } catch (err) {
    console.warn("[Gong] listFlows failed:", err);
    return [];
  }
}

/**
 * Simulated send. Persists an OutreachMessage marker with sentVia set to
 * "gong-engage (simulated)" and never hits Gong.
 *
 * This is deliberate for the demo — the user asked for a push button that
 * *shows* the integration path without actually emailing prospects.
 */
export async function sendViaGongSimulated(args: {
  visitorId: string;
  flowId: string | null;
  flowName: string | null;
  subject: string;
  body: string;
}): Promise<{ simulated: true; sentAt: Date }> {
  const sentAt = new Date();

  await prisma.outreachMessage.updateMany({
    where: { visitorId: args.visitorId, subject: args.subject },
    data: {
      sentVia: args.flowName
        ? `gong-engage (simulated via "${args.flowName}")`
        : "gong-engage (simulated)",
      sentAt,
    },
  });

  // Emit a clear server-side marker so the demo can point at the log line.
  console.log(
    `[Gong Engage/SIM] visitor=${args.visitorId} flow=${args.flowId ?? "none"} subject="${args.subject}"`,
  );

  return { simulated: true, sentAt };
}

// ---------- LIVE Engage send ----------

/**
 * Real Gong Engage send. Adds a prospect to a Gong Flow by POSTing to
 * `/v2/flows/{flowId}/assignees` with the prospect's email and CRM linkage.
 *
 * Gated: only invoked when `gong_live_send_enabled` is toggled ON in Settings.
 * Default is OFF → the simulated path runs instead.
 *
 * Flow-assignees endpoint shape (Gong public API v2):
 *   POST /v2/flows/{flowId}/assignees
 *   { "contactReferences": [{ "emailAddress": "...", "firstName": "...", ... }] }
 *
 * Gong responds 200/201 with an array of flowAssignmentIds. We return the first
 * one and surface any non-2xx error via the gongFetch throw.
 */
export async function sendViaGongLive(args: {
  visitorId: string;
  flowId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  subject: string;
  body: string;
}): Promise<{ simulated: false; sentAt: Date; flowAssignmentId: string | null }> {
  const config = await getGongConfig();
  if (!config) {
    throw new Error(
      "Gong is not configured — cannot perform live Engage send.",
    );
  }
  if (!args.flowId) {
    throw new Error(
      "No Gong Flow ID configured. Set a default Flow in Settings or pass one explicitly.",
    );
  }

  interface AssigneesResponse {
    flowAssignees?: Array<{
      flowAssignmentId?: string;
      contactReference?: { emailAddress?: string };
    }>;
  }

  const payload = {
    contactReferences: [
      {
        emailAddress: args.email,
        firstName: args.firstName ?? undefined,
        lastName: args.lastName ?? undefined,
        companyName: args.companyName ?? undefined,
      },
    ],
  };

  const res = await gongFetch<AssigneesResponse>(
    config,
    `/v2/flows/${encodeURIComponent(args.flowId)}/assignees`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  const sentAt = new Date();
  const assignmentId = res.flowAssignees?.[0]?.flowAssignmentId ?? null;

  // Update the corresponding OutreachMessage row so the UI reflects the real send.
  await prisma.outreachMessage.updateMany({
    where: { visitorId: args.visitorId, subject: args.subject },
    data: {
      sentVia: assignmentId
        ? `gong-engage (live, assignment=${assignmentId})`
        : "gong-engage (live)",
      sentAt,
    },
  });

  console.log(
    `[Gong Engage/LIVE] visitor=${args.visitorId} flow=${args.flowId} assignment=${assignmentId}`,
  );

  return { simulated: false, sentAt, flowAssignmentId: assignmentId };
}

/**
 * Legacy entry point kept for compatibility with the original visitor action
 * wiring. Routes to the simulated sender. For the real path use
 * `sendViaGongLive` directly (gated by the `gong_live_send_enabled` flag).
 */
export async function sendViaGong(
  visitorId: string,
  _email: string,
  subject: string,
  body: string,
): Promise<boolean> {
  await sendViaGongSimulated({
    visitorId,
    flowId: null,
    flowName: null,
    subject,
    body,
  });
  return true;
}
