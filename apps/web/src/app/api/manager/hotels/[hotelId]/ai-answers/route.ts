// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/ai-answers — rehberin cevaplayamadığı
// soruya otelcinin cevabı. Taslaktaki otel ifadelerine (aiFacts) eklenir;
// misafir rehberi yayın onayından sonra kullanır. Aynı soru tekrar
// cevaplanırsa eski cevap değişir.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireHotelAccess } from "@/lib/auth/guards";
import { containsContactInfo } from "@/lib/contact-guard";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { ANSWER_MAX_CHARS, UNANSWERED_MAX_CHARS, answerFactText, answerFor } from "@/lib/ai/unanswered";

type RouteParams = { params: Promise<{ hotelId: string }> };

/** hotelUpdateSchema ile aynı sınır: en fazla 50 otel ifadesi. */
const MAX_FACTS = 50;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(UNANSWERED_MAX_CHARS),
  answer: z.string().trim().min(2, "Cevap boş olamaz").max(ANSWER_MAX_CHARS, `Cevap en fazla ${ANSWER_MAX_CHARS} karakter olabilir`),
});

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Geçersiz istek";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const { question, answer } = parsed.data;
  // Rehber iletişim bilgisi vermez; yayına gönderimde de reddedilir.
  if (containsContactInfo(answer)) {
    return NextResponse.json(
      { ok: false, error: "Cevapta telefon, e-posta ya da web adresi olamaz. Misafir iletişim için talep formunu kullanır." },
      { status: 400 },
    );
  }

  const db = getDb();
  // İyimser kilit: arada başka bir düzenleme olduysa bir kez yeniden dene.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [current] = await db
      .select({ aiFacts: hotelsTable.aiFacts, draftRevision: hotelsTable.draftRevision })
      .from(hotelsTable)
      .where(eq(hotelsTable.id, guard.hotel.id))
      .limit(1);
    if (!current) return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });

    // Aynı sorunun eski cevabı varsa yenisiyle değişir.
    const others = current.aiFacts.filter((fact) => answerFor(question, [fact]) === null);
    if (others.length >= MAX_FACTS) {
      return NextResponse.json(
        { ok: false, error: `En fazla ${MAX_FACTS} otel ifadesi eklenebilir. Tesis bilgilerinden eski ifadeleri birleştirin.` },
        { status: 400 },
      );
    }
    const facts = [...others, answerFactText(question, answer)];
    const [updated] = await db
      .update(hotelsTable)
      .set({ aiFacts: facts, draftRevision: sql`${hotelsTable.draftRevision} + 1`, updatedAt: new Date() })
      .where(and(eq(hotelsTable.id, guard.hotel.id), eq(hotelsTable.draftRevision, current.draftRevision)))
      .returning();
    if (updated) return NextResponse.json({ ok: true, draftRevision: updated.draftRevision, status: "taslak" });
  }
  return NextResponse.json({ ok: false, error: "Tesis bilgileri aynı anda değiştirildi, lütfen tekrar deneyin." }, { status: 409 });
}
