import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt, decrypt, maskValue } from "@/lib/crypto";

export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany();

    const masked = settings.map((s) => {
      let lastFour: string | undefined;
      try {
        const decrypted = decrypt(s.value);
        lastFour = decrypted.length > 4 ? decrypted.slice(-4) : undefined;
      } catch {
        // If decryption fails, no lastFour
      }

      return {
        key: s.key,
        hasValue: true,
        enabled: s.enabled,
        lastFour,
      };
    });

    return NextResponse.json({ settings: masked });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, enabled } = body as {
      key: string;
      value?: string;
      enabled?: boolean;
    };

    if (!key) {
      return NextResponse.json(
        { error: "Key is required" },
        { status: 400 }
      );
    }

    // If value is provided, encrypt and upsert
    if (value !== undefined && value !== "") {
      const encryptedValue = encrypt(value);
      await prisma.appSetting.upsert({
        where: { key },
        update: {
          value: encryptedValue,
          enabled: enabled ?? true,
        },
        create: {
          key,
          value: encryptedValue,
          enabled: enabled ?? true,
        },
      });
    } else if (enabled !== undefined) {
      // Only update enabled flag
      const existing = await prisma.appSetting.findUnique({ where: { key } });
      if (existing) {
        await prisma.appSetting.update({
          where: { key },
          data: { enabled },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update setting:", error);
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
