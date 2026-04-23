import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

interface SalesforceConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  instanceUrl: string;
}

interface SalesforceRecord {
  Id: string;
  [key: string]: unknown;
}

interface QueryResult {
  totalSize: number;
  done: boolean;
  records: SalesforceRecord[];
}

/**
 * Get Salesforce configuration from settings
 */
export async function getSalesforceConfig(): Promise<SalesforceConfig | null> {
  const keys = [
    "sf_client_id",
    "sf_client_secret",
    "sf_refresh_token",
    "sf_instance_url",
    "sf_enabled",
  ];

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: keys } },
  });

  const settingsMap = new Map(settings.map((s) => [s.key, s]));

  const enabled = settingsMap.get("sf_enabled");
  if (!enabled?.enabled || !enabled.value) return null;

  const clientId = settingsMap.get("sf_client_id");
  const clientSecret = settingsMap.get("sf_client_secret");
  const refreshToken = settingsMap.get("sf_refresh_token");
  const instanceUrl = settingsMap.get("sf_instance_url");

  if (!clientId?.value || !clientSecret?.value || !refreshToken?.value || !instanceUrl?.value) {
    return null;
  }

  return {
    clientId: decrypt(clientId.value),
    clientSecret: decrypt(clientSecret.value),
    refreshToken: decrypt(refreshToken.value),
    instanceUrl: decrypt(instanceUrl.value),
  };
}

/**
 * Get an access token using the refresh token flow
 */
async function getAccessToken(config: SalesforceConfig): Promise<string> {
  const tokenUrl = `${config.instanceUrl}/services/oauth2/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Salesforce token refresh failed: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Execute a SOQL query
 */
async function query(
  config: SalesforceConfig,
  accessToken: string,
  soql: string,
): Promise<QueryResult> {
  const url = `${config.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Salesforce query failed: ${error}`);
  }

  return response.json();
}

/**
 * Create a Lead in Salesforce
 */
async function createLead(
  config: SalesforceConfig,
  accessToken: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `${config.instanceUrl}/services/data/v59.0/sobjects/Lead`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Salesforce Lead creation failed: ${error}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * Create a Task/Activity on a Salesforce record
 */
async function createActivity(
  config: SalesforceConfig,
  accessToken: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `${config.instanceUrl}/services/data/v59.0/sobjects/Task`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Salesforce Task creation failed: ${error}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * Sync a visitor to Salesforce
 * - Dedup by email: check if Lead or Contact exists
 * - New → create Lead with SQL status
 * - Existing → create Activity noting the website revisit
 */
export async function syncVisitorToSalesforce(visitorId: string): Promise<{
  action: string;
  sfObjectId: string | null;
}> {
  const config = await getSalesforceConfig();
  if (!config) {
    throw new Error("Salesforce not configured");
  }

  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    include: { pageVisits: true, icpScore: true },
  });

  if (!visitor) throw new Error(`Visitor ${visitorId} not found`);
  if (!visitor.email) throw new Error("Visitor has no email — cannot sync to Salesforce");

  const accessToken = await getAccessToken(config);

  // Dedup check: existing Lead?
  const leadResult = await query(
    config,
    accessToken,
    `SELECT Id, Status, OwnerId FROM Lead WHERE Email = '${visitor.email.replace(/'/g, "\\'")}' LIMIT 1`,
  );

  if (leadResult.totalSize > 0) {
    // Existing lead — add activity
    const leadId = leadResult.records[0].Id;
    const taskId = await createActivity(config, accessToken, {
      WhoId: leadId,
      Subject: `Website Revisit: ${visitor.pageVisits.map((p) => p.url).join(", ")}`,
      Description: buildActivityDescription(visitor),
      Status: "Completed",
      Priority: "Normal",
      Type: "Other",
    });

    await logSfSync(visitorId, "update_activity", taskId, "success");
    return { action: "update_activity", sfObjectId: taskId };
  }

  // Dedup check: existing Contact?
  const contactResult = await query(
    config,
    accessToken,
    `SELECT Id, AccountId FROM Contact WHERE Email = '${visitor.email.replace(/'/g, "\\'")}' LIMIT 1`,
  );

  if (contactResult.totalSize > 0) {
    // Existing contact/customer — log activity
    const contactId = contactResult.records[0].Id;
    const taskId = await createActivity(config, accessToken, {
      WhoId: contactId,
      Subject: `Customer Website Revisit: ${visitor.companyName || "Unknown"}`,
      Description: buildActivityDescription(visitor),
      Status: "Completed",
      Priority: "High",
      Type: "Other",
    });

    await logSfSync(visitorId, "update_activity", taskId, "success");
    return { action: "update_activity", sfObjectId: taskId };
  }

  // New visitor — create Lead
  const tier = visitor.icpScore?.tier || "tier2";
  const leadId = await createLead(config, accessToken, {
    FirstName: visitor.firstName,
    LastName: visitor.lastName || visitor.companyName || "Unknown",
    Email: visitor.email,
    Title: visitor.title,
    Company: visitor.companyName || "Unknown",
    Industry: visitor.industry,
    City: visitor.city,
    State: visitor.state,
    PostalCode: visitor.zipcode,
    Website: visitor.website,
    LeadSource: "Website Visitor (RB2B)",
    Status: tier === "tier1" ? "SQL" : "MQL",
    Description: buildActivityDescription(visitor),
  });

  // Update visitor status
  await prisma.visitor.update({
    where: { id: visitorId },
    data: { status: "SYNCED_TO_SF" },
  });

  await logSfSync(visitorId, "create_lead", leadId, "success");
  return { action: "create_lead", sfObjectId: leadId };
}

function buildActivityDescription(visitor: {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  companyName: string | null;
  industry: string | null;
  employeeCount: string | null;
  pageVisits: { url: string }[];
  icpScore: { totalScore: number; tier: string } | null;
}): string {
  const lines = [
    "=== WEBSITE VISITOR LEAD ===",
    `Visitor: ${[visitor.firstName, visitor.lastName].filter(Boolean).join(" ") || "Unknown"}`,
    `Title: ${visitor.title || "Unknown"}`,
    `Company: ${visitor.companyName || "Unknown"}`,
    `Industry: ${visitor.industry || "Unknown"}`,
    `Company Size: ${visitor.employeeCount || "Unknown"}`,
    "",
    "=== VISIT DETAILS ===",
    `Pages Viewed:`,
    ...visitor.pageVisits.map((p) => `  - ${p.url}`),
    "",
    `ICP Score: ${visitor.icpScore?.totalScore ?? "N/A"}/100 (${visitor.icpScore?.tier || "unscored"})`,
  ];

  return lines.join("\n");
}

async function logSfSync(
  visitorId: string,
  action: string,
  sfObjectId: string | null,
  status: string,
  errorMsg?: string,
) {
  await prisma.sfSyncLog.create({
    data: {
      visitorId,
      action,
      sfObjectId,
      status,
      errorMsg: errorMsg || null,
    },
  });
}
