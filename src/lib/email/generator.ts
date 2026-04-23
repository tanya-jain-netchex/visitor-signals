import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { NETCHEX_CONTEXT, getProductFromPageUrl, matchPersona } from "./netchex-context";

interface GeneratedEmail {
  subject: string;
  body: string;
}

/**
 * Default outreach prompt template. Supports {{placeholder}} interpolation.
 *
 * Users can override this in Settings → LLM Prompt. Placeholders are filled
 * from visitor data + Netchex product context at generation time.
 *
 * Available placeholders:
 *   {{name}}              — prospect FIRST NAME only (fallback "there")
 *   {{firstName}}         — alias for {{name}}
 *   {{fullName}}          — prospect first + last name
 *   {{title}}             — job title (or "Unknown")
 *   {{company}}           — company name (or "their company")
 *   {{industry}}          — company industry
 *   {{companySize}}       — employee count range
 *   {{revenue}}           — revenue range
 *   {{pagesVisited}}      — comma-separated list of URLs
 *   {{productContext}}    — Netchex product blurbs relevant to visitor
 *   {{personaName}}       — "HR/Ops Manager" or "CEO/Owner"
 *   {{personaFocus}}      — persona focus areas
 *   {{personaTone}}       — persona tone descriptor
 *   {{enrichmentContext}} — Clay/Apify enrichment JSON (for more color)
 *   {{companyStats}}      — Netchex stats (clients, CSAT, admin time saved)
 *   {{companyTagline}}    — Netchex one-liner
 */
export const DEFAULT_EMAIL_PROMPT_TEMPLATE = `You are writing as a Netchex SDR/AE. Netchex is a cloud HCM platform for SMBs with hourly and deskless workforces.

ABOUT NETCHEX:
- {{companyTagline}}
- {{companyStats}}

PROSPECT INFO:
- Name: {{name}}
- Title: {{title}}
- Company: {{company}}
- Industry: {{industry}}
- Company Size: {{companySize}} employees
- Revenue: {{revenue}}
- Pages Visited: {{pagesVisited}}
{{enrichmentContext}}

RELEVANT PRODUCTS:
{{productContext}}

BUYER PERSONA: {{personaName}}
- Focus areas: {{personaFocus}}
- Tone: {{personaTone}}

VOICE PROFILE (follow exactly — derived from real Netchex outbound emails):

OPENING
- Greeting is ALWAYS "Hey {{name}}," — not "Hi", never "Dear" or "Hello".
- First sentence is ONE of these four archetypes, chosen by what fits:
  (a) Pain-point flat statement — e.g. "Running payroll and staffing across multiple properties can get complicated fast."
  (b) Rhetorical question + empathy beat — e.g. "Ever opened a ticket and waited days for a response? We get it."
  (c) Persona opener — e.g. "I work with {{industry}} operators across the country…"
  (d) Pattern-interrupt (use only if the visitor has been scored low-intent or revisited after silence) — e.g. "I'll pause outreach for now. Before I do, one quick question —"

LENGTH & RHYTHM
- Body target: 85–95 words total (hard ceiling 110). Do not pad.
- Sentences: 8–15 words each. Short and punchy.
- Paragraphs: 1–2 sentences each. Heavy whitespace between them.
- Occasional one-sentence paragraph for emphasis is good.

TONE
- Casual, peer-to-peer, operator-to-operator. Never formal, never vendor-to-buyer.
- Use contractions: "you'll," "we're," "doesn't," "can't."
- Include an empathy beat where natural: "We get it," "Most teams we see," "Most {{industry}} folks we talk to."
- Refer to "your team," "your day," "your members/guests/crew" — not "your organization."
- Benefit-forward, not feature-forward. Features only belong in a compact bullet list if present at all.

CTA (soft, permission-based, quantified)
- Phrase the CTA as a QUESTION.
- Specify duration: "quick," "10-minute," "short."
- Preferred phrasings: "Would you be open to a quick conversation about …?" · "Is a 10-minute overview worth scheduling?" · "Worth a quick look to see how they're doing it?" · "Want me to show you?"
- Optional referral fallback for the last line: "If someone else owns payroll and HR there, I'd appreciate being pointed in the right direction."

PERSONALIZATION
- Never write "I saw you visited our website." Reference the interest area naturally.
- Name 2–3 same-industry Netchex customers inline as social proof when the industry is known. Examples by vertical:
  - Hotels/hospitality: IVY Hospitality, Baywood Hotels, Northwestern Southern Hospitality
  - Manufacturing: CFAN, Willbanks
  - Hospitality integrations: HIA, Hotel Effectiveness, InnFlow, M3
  - Restaurants/clubs: pair with seasonal hiring + POS integration framing
  If none of these verticals match {{industry}}, skip social proof rather than inventing customers.
- Tie pain to the industry when you can: tipped wages / 24-hour shifts (hotels), seasonal hiring / POS integration (clubs), interview no-shows (hiring product), overtime control (manufacturing).

SUBJECT LINE
- Under 60 characters. Choose ONE pattern:
  (a) "Idea for {{company}}"
  (b) A benefit headline tied to their interest area, e.g. "Cutting overtime across {{companySize}}-employee manufacturing" — keep concrete.
- No "quick question" / "following up" clichés.

HARD RULES
- No emojis, no markdown, no bold, no code fences, no "Dear", no "I hope this finds you well."
- Do not mention Gong, Clay, enrichment, scoring, or that you found them via RB2B.
- Sign off: two lines — "{{name}}" (recipient's first name line is NOT the sign-off; sign-off is the sender block). Use:
  Netchex Team
  Payroll · HR · Benefits · Time

FORMAT YOUR RESPONSE EXACTLY AS:
SUBJECT: [subject line here]
BODY: [email body here]`;

/**
 * Replace {{placeholder}} tokens in a template with values from the map.
 * Missing keys render as empty strings (so an unused placeholder doesn't
 * break the prompt or leak "{{foo}}" into the LLM input).
 */
function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

/**
 * Generate a personalized outreach email for a qualified visitor using LLM
 */
export async function generateOutreachEmail(visitorId: string): Promise<GeneratedEmail | null> {
  // Check LLM configuration
  const [llmKeyRow, llmProviderRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "llm_api_key" } }),
    prisma.appSetting.findUnique({ where: { key: "llm_provider" } }),
  ]);

  if (!llmKeyRow?.enabled || !llmKeyRow.value) {
    console.log("LLM not configured, skipping email generation");
    return null;
  }

  const apiKey = decrypt(llmKeyRow.value);
  const provider = llmProviderRow?.value ? decrypt(llmProviderRow.value) : "openai";

  // Allow users to override the prompt template via Settings
  const templateRow = await prisma.appSetting.findUnique({
    where: { key: "llm_prompt_template" },
  });
  const template =
    templateRow?.value && templateRow.enabled
      ? (() => {
          try {
            return decrypt(templateRow.value);
          } catch {
            return templateRow.value;
          }
        })()
      : DEFAULT_EMAIL_PROMPT_TEMPLATE;

  // Load visitor with all relations
  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    include: {
      pageVisits: true,
      enrichment: true,
      icpScore: true,
    },
  });

  if (!visitor) throw new Error(`Visitor ${visitorId} not found`);

  // Build context for the prompt (using stored template if configured)
  const prompt = buildPrompt(visitor, template);

  // Call LLM
  const result = await callLLM(provider, apiKey, prompt);
  if (!result) return null;

  // Save to DB
  await prisma.outreachMessage.create({
    data: {
      visitorId,
      subject: result.subject,
      body: result.body,
    },
  });

  return result;
}

function buildPrompt(
  visitor: {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    companyName: string | null;
    industry: string | null;
    employeeCount: string | null;
    estimatedRevenue: string | null;
    pageVisits: { url: string }[];
    enrichment: { profileData: unknown } | null;
    icpScore: { totalScore: number; tier: string; scoreBreakdown: unknown } | null;
  },
  template: string,
): string {
  // {{name}} is the greeting token — ALWAYS first name only per Netchex tone
  // profile ("Hey [first name],"). When no first name is captured we fall back
  // to "there" rather than leaking the full formal name or an empty greeting.
  // {{fullName}} is exposed separately for anyone who wants the whole name
  // (e.g. signature blocks, CRM task descriptions).
  const name = (visitor.firstName || "").trim() || "there";
  const fullName =
    [visitor.firstName, visitor.lastName].filter(Boolean).join(" ").trim() ||
    name;
  const persona = matchPersona(visitor.title);
  // Guard against matchPersona returning a key that isn't present in the
  // persona map (shouldn't happen, but we never want persona misconfig to
  // block email generation for a visitor with sparse data).
  const personaConfig =
    NETCHEX_CONTEXT.personas[persona] ??
    NETCHEX_CONTEXT.personas.hrOpsManager ??
    Object.values(NETCHEX_CONTEXT.personas)[0];

  // Determine product interests from pages visited. Tolerate visitors with
  // zero page visits (fresh signup, CSV-imported record, etc.) — we still want
  // an email, just default to payroll as the anchor product.
  const productInterests = new Set<string>();
  for (const pv of visitor.pageVisits ?? []) {
    const product = getProductFromPageUrl(pv.url);
    if (product) productInterests.add(product);
  }

  const products = Array.from(productInterests)
    .map(
      (key) => NETCHEX_CONTEXT.products[key as keyof typeof NETCHEX_CONTEXT.products],
    )
    .filter(Boolean); // guard against a page-URL mapper returning a stale key

  // If no specific product interest detected, default to payroll
  if (products.length === 0) {
    products.push(NETCHEX_CONTEXT.products.payroll);
  }

  const productContext = products
    .map((p) => `- ${p.name}: ${p.benefits.join(", ")}`)
    .join("\n");

  const enrichmentContext = visitor.enrichment
    ? `Enrichment data available: ${JSON.stringify(visitor.enrichment.profileData).slice(0, 500)}`
    : "";

  const companyStats = `${NETCHEX_CONTEXT.company.stats.clients} clients, ${NETCHEX_CONTEXT.company.stats.csat} CSAT, saves businesses ${NETCHEX_CONTEXT.company.stats.adminTimeSaved} on admin`;

  return interpolate(template, {
    name,
    firstName: name,
    fullName,
    title: visitor.title || "Unknown",
    company: visitor.companyName || "their company",
    industry: visitor.industry || "Unknown",
    companySize: visitor.employeeCount || "Unknown",
    revenue: visitor.estimatedRevenue || "Unknown",
    pagesVisited: visitor.pageVisits.map((pv) => pv.url).join(", ") || "(none yet)",
    productContext,
    personaName: personaConfig.name,
    personaFocus: personaConfig.focusAreas.join(", "),
    personaTone: personaConfig.tone,
    enrichmentContext,
    companyStats,
    companyTagline: NETCHEX_CONTEXT.company.tagline,
  });
}

async function callLLM(
  provider: string,
  apiKey: string,
  prompt: string,
): Promise<GeneratedEmail | null> {
  try {
    if (provider === "anthropic") {
      return await callAnthropic(apiKey, prompt);
    } else if (provider === "gemini" || provider === "google") {
      return await callGemini(apiKey, prompt);
    } else {
      return await callOpenAI(apiKey, prompt);
    }
  } catch (error) {
    console.error(`LLM call failed (${provider}):`, error);
    return null;
  }
}

async function callOpenAI(apiKey: string, prompt: string): Promise<GeneratedEmail | null> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 500,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  return parseEmailResponse(content);
}

async function callGemini(apiKey: string, prompt: string): Promise<GeneratedEmail | null> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  // 2.5 Flash is a reasoning model — it burns a lot of tokens on internal
  // "thinking" before emitting output. 500 tokens is often not enough and you
  // get an empty `.text`. Bump to 1500 and disable thinking budget so we get
  // real output tokens. Also forbid markdown explicitly so we don't have to
  // strip as much in the parser.
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 1500,
      // Prevent reasoning budget from eating the entire output window.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const content = result.text;
  if (!content) {
    console.warn(
      "[Gemini] Empty text in response:",
      JSON.stringify(result).slice(0, 400)
    );
    return null;
  }

  return parseEmailResponse(content);
}

async function callAnthropic(apiKey: string, prompt: string): Promise<GeneratedEmail | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const content =
    message.content[0]?.type === "text" ? message.content[0].text : null;
  if (!content) return null;

  return parseEmailResponse(content);
}

/**
 * Parse LLM output into { subject, body }. Tolerant of:
 *   - Markdown wrappers like **SUBJECT:** or `SUBJECT:`
 *   - Code fences ```text ... ```
 *   - Leading preamble ("Here's the email:")
 *   - Gemini's tendency to output Subject/Body on separate paragraphs
 */
function parseEmailResponse(content: string): GeneratedEmail | null {
  // Strip triple-backtick code fences if the model wrapped its output
  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strip markdown bold/italic around SUBJECT/BODY labels so they can be matched
  cleaned = cleaned
    .replace(/\*\*\s*(SUBJECT|BODY)\s*:?\s*\*\*/gi, "$1:")
    .replace(/`\s*(SUBJECT|BODY)\s*:?\s*`/gi, "$1:");

  const subjectMatch = cleaned.match(/SUBJECT\s*:?\s*([^\n]+)/i);
  // Body extends from "BODY:" to the end of the string (or end of doc)
  const bodyMatch = cleaned.match(/BODY\s*:?\s*([\s\S]+)/i);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].replace(/^\*+|\*+$/g, "").trim(),
      body: bodyMatch[1]
        .replace(/^\*+|\*+$/g, "")
        .replace(/^["']|["']$/g, "")
        .trim(),
    };
  }

  // Fallback: first non-empty line is subject, rest is body
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const firstLine = lines[0]
    .replace(/^(Subject|Re|Subj)\s*:?\s*/i, "")
    .replace(/^\*+|\*+$/g, "")
    .trim();

  return {
    subject: firstLine || "Quick question",
    body: lines.slice(1).join("\n").trim() || cleaned,
  };
}
