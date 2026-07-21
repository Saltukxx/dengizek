// ---------------------------------------------------------------------------
// POST /api/admin/hotels/[hotelId]/moderation — onayla / reddet
// onayla → yayinda; reddet → reddedildi (not zorunlu)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { clearFactCatalogCache, syncFactEmbeddings } from "@/lib/ai/fact-store";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { moderationDecisionSchema } from "@/lib/schemas/hotel-admin";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { hotelId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moderationDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [hotel] = await db
    .select({ id: hotelsTable.id, status: hotelsTable.status, slug: hotelsTable.slug, submittedRevision: hotelsTable.submittedRevision, submittedSnapshot: hotelsTable.submittedSnapshot })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, hotelId))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }

  if (hotel.status !== "incelemede") {
    return NextResponse.json(
      {
        ok: false,
        error: `Yalnızca incelemedeki tesisler onaylanabilir veya reddedilebilir (mevcut: ${hotel.status}).`,
      },
      { status: 409 },
    );
  }
  if (!hotel.submittedSnapshot || hotel.submittedRevision !== parsed.data.submittedRevision) {
    return NextResponse.json({ ok: false, code: "REVISION_CONFLICT", currentRevision: hotel.submittedRevision }, { status: 409 });
  }

  const yeniDurum = parsed.data.karar === "onayla" ? "yayinda" : "reddedildi";
  const now = new Date();

  const [updated] = await db
    .update(hotelsTable)
    .set({
      status: yeniDurum,
      moderationNote: parsed.data.not?.trim() || null,
      reviewedAt: now,
      reviewedBy: guard.user.id,
      updatedAt: now,
      ...(parsed.data.karar === "onayla" ? { publishedSnapshot: hotel.submittedSnapshot, publishedRevision: hotel.submittedRevision } : {}),
    })
    .where(and(eq(hotelsTable.id, hotel.id), eq(hotelsTable.status, "incelemede"), eq(hotelsTable.submittedRevision, parsed.data.submittedRevision)))
    .returning();
  if (!updated) return NextResponse.json({ ok: false, code: "REVISION_CONFLICT" }, { status: 409 });

  if (parsed.data.karar === "onayla") {
    // publishedSnapshot değişti — misafir AI sohbetinin gördüğü aiPersona/
    // aiFacts/aiPolicies de bu snapshot'tan okunuyor (bkz. getHotelAiProfile).
    clearFactCatalogCache(hotel.slug);
    // Embedding'ler publish-zamanlı senkronize edilir (request-zamanlı değil)
    // — chat isteklerinin gecikmesini etkilemez. Kendi try/catch'i var,
    // başarısız olsa da onay akışını kırmaz.
    await syncFactEmbeddings(hotel.slug);
  }

  await logAudit({
    actor: guard.user,
    action: parsed.data.karar === "onayla" ? "otel.onaylandi" : "otel.reddedildi",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug: hotel.slug, eskiDurum: hotel.status, yeniDurum, not: parsed.data.not },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
