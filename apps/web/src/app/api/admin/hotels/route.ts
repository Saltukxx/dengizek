// ---------------------------------------------------------------------------
// GET/POST /api/admin/hotels — tüm oteller / yeni otel oluştur
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, moderationStatusEnum } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

const createHotelSchema = z.object({
  name: z.string().min(1, "Tesis adı gerekli").max(200),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
});

/** Türkçe karakterleri sadeleştirip URL dostu slug üretir. */
function slugify(value: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  return value
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "tesis";
}

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");

  const db = getDb();
  const baseQuery = db
    .select({
      id: hotelsTable.id,
      slug: hotelsTable.slug,
      name: hotelsTable.name,
      city: hotelsTable.city,
      country: hotelsTable.country,
      status: hotelsTable.status,
      moderationNote: hotelsTable.moderationNote,
      submittedAt: hotelsTable.submittedAt,
      reviewedAt: hotelsTable.reviewedAt,
      createdAt: hotelsTable.createdAt,
    })
    .from(hotelsTable);

  const isValidStatus = (v: string): v is (typeof moderationStatusEnum.enumValues)[number] =>
    (moderationStatusEnum.enumValues as readonly string[]).includes(v);

  const hotels =
    durum && isValidStatus(durum)
      ? await baseQuery.where(eq(hotelsTable.status, durum)).orderBy(hotelsTable.name)
      : await baseQuery.orderBy(hotelsTable.name);

  return NextResponse.json({ ok: true, hotels });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createHotelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const base = slugify(parsed.data.name);

  // Benzersiz slug — çakışmada sayısal sonek
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [existing] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(eq(hotelsTable.slug, slug))
      .limit(1);
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  const [hotel] = await db
    .insert(hotelsTable)
    .values({
      slug,
      name: parsed.data.name,
      city: parsed.data.city,
      country: parsed.data.country,
    })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "otel.olusturuldu",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug, name: hotel.name },
  });

  return NextResponse.json({ ok: true, hotel }, { status: 201 });
}
