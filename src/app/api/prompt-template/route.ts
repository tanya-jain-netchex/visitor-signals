import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { DEFAULT_EMAIL_PROMPT_TEMPLATE } from "@/lib/email/generator";

/**
 * Outreach email prompt template editor.
 *
 * Unlike the other AppSettings, the prompt is not a secret — it's the LLM
 * instruction we want the user to see/edit in full. So GET returns the raw
 * value (decrypted) rather than masking. PUT encrypts for consistency with
 * the rest of the AppSetting table.
 *
 * Supported placeholders (see generator.ts): {{name}}, {{title}}, {{company}},
 * {{industry}}, {{companySize}}, {{revenue}}, {{pagesVisited}},
 * {{productContext}}, {{personaName}}, {{personaFocus}}, {{personaTone}},
 * {{enrichmentContext}}, {{companyStats}}, {{companyTagline}}.
 */
export async function GET() {
  const row = await prisma.appSetting.findUnique({
    where: { key: "llm_prompt_template" },
  });

  if (!row) {
    return NextResponse.json({
      template: DEFAULT_EMAIL_PROMPT_TEMPLATE,
      isCustom: false,
      enabled: false,
    });
  }

  let value = row.value;
  try {
    value = decrypt(row.value);
  } catch {
    // Fall back to raw if decryption fails (legacy unencrypted values)
  }

  return NextResponse.json({
    template: value,
    isCustom: true,
    enabled: row.enabled,
  });
}

export async function PUT(request: NextRequest) {
  let body: { template?: string; enabled?: boolean; reset?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // "Reset to default" deletes the custom row so GET falls back to the default
  if (body.reset) {
    await prisma.appSetting
      .delete({ where: { key: "llm_prompt_template" } })
      .catch(() => {});
    return NextResponse.json({
      success: true,
      template: DEFAULT_EMAIL_PROMPT_TEMPLATE,
      isCustom: false,
    });
  }

  if (typeof body.template !== "string" || body.template.trim().length === 0) {
    return NextResponse.json(
      { error: "Template is required" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(body.template);

  await prisma.appSetting.upsert({
    where: { key: "llm_prompt_template" },
    create: {
      key: "llm_prompt_template",
      value: encrypted,
      enabled: body.enabled ?? true,
    },
    update: {
      value: encrypted,
      enabled: body.enabled ?? true,
    },
  });

  return NextResponse.json({
    success: true,
    template: body.template,
    isCustom: true,
  });
}
