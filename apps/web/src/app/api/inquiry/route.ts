import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { inquiryFormSchema } from "@/lib/schemas/inquiry";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, inquiriesTable } from "@/lib/db/schema";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Misafir talebi:
 * - DATABASE_URL tanımlıysa inquiries tablosuna yazılır (hotelSlug → hotelId çözülür)
 * - değilse eski mock davranışı korunur (DB'siz geliştirme)
 */
export async function POST(req: Request) {
  // Hız sınırı — IP başına 5 istek/dk
  if (!checkRateLimit(requestIp(req), { name: "inquiry", windowMs: 60_000, limit: 5 })) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla istek gönderdiniz, lütfen biraz bekleyin." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Doğrulama başarısız",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (!isDbConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info("[inquiry:mock]", parsed.data);
    }
    return NextResponse.json({ ok: true, id: `mock-${Date.now()}` });
  }

  const db = getDb();

  // hotelSlug verilmişse hotelId'ye çözümle (bulunamazsa null bırakılır)
  let hotelId: string | null = null;
  if (parsed.data.hotelSlug) {
    const [hotel] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(eq(hotelsTable.slug, parsed.data.hotelSlug))
      .limit(1);
    hotelId = hotel?.id ?? null;
  }

  const [inquiry] = await db
    .insert(inquiriesTable)
    .values({
      hotelId,
      hotelSlug: parsed.data.hotelSlug ?? null,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      message: parsed.data.message,
      marketingConsent: parsed.data.marketingConsent,
    })
    .returning({ id: inquiriesTable.id });

  return NextResponse.json({ ok: true, id: inquiry.id });
}
