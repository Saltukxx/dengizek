// ---------------------------------------------------------------------------
// GET/PATCH /api/manager/hotels/[hotelId] — tesis bilgisi okuma/güncelleme
// hotelId: uuid veya slug kabul edilir (requireHotelAccess çözümler)
// İçerik güncellemesi yayın durumunu DEĞİŞTİRMEZ.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { hotelUpdateSchema } from "@/lib/schemas/hotel-admin";
import { assertCancellationRuleBelongsToHotel } from "@/lib/tenant-integrity";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [hotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.id, guard.hotel.id))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hotel });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = hotelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertCancellationRuleBelongsToHotel(guard.hotel.id, parsed.data.cancellationRuleId))) {
    return NextResponse.json({ ok: false, error: "İptal kuralı bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const { expectedRevision, ...fields } = parsed.data;
  const [current] = await db.select({ draftRevision: hotelsTable.draftRevision })
    .from(hotelsTable).where(eq(hotelsTable.id, guard.hotel.id)).limit(1);
  if (!current || current.draftRevision !== expectedRevision) {
    return NextResponse.json(
      { ok: false, code: "REVISION_CONFLICT", currentRevision: current?.draftRevision },
      { status: 409 },
    );
  }
  const [updated] = await db
    .update(hotelsTable)
    .set({ ...fields, draftRevision: sql`${hotelsTable.draftRevision} + 1`, updatedAt: new Date() })
    .where(and(eq(hotelsTable.id, guard.hotel.id), eq(hotelsTable.draftRevision, expectedRevision)))
    .returning();
  if (!updated) {
    const [latest] = await db.select({ draftRevision: hotelsTable.draftRevision })
      .from(hotelsTable).where(eq(hotelsTable.id, guard.hotel.id)).limit(1);
    return NextResponse.json({ ok: false, code: "REVISION_CONFLICT", currentRevision: latest?.draftRevision }, { status: 409 });
  }

  // Not: AI alanları (aiFacts/aiPolicies/aiPersona) ve "doğrulanmış" fact
  // kaynağı olan spec alanları (cancellationPolicy, amenities vb.) misafir
  // sohbetine yalnızca admin onayından sonra publishedSnapshot üzerinden
  // yansır (bkz. getHotelAiProfile, getPublishedHotelContent). Bu canlı
  // taslak satır düzenlemesi guest'i etkilemediği için fact-cache temizliği
  // burada gereksiz — cache admin onay rotasında temizlenir.

  return NextResponse.json({ ok: true, hotel: updated });
}
