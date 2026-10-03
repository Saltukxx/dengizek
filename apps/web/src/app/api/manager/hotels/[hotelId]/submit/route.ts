// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/submit — tesisi incelemeye gönder
// taslak | reddedildi | yayinda → incelemede
//
// Yayındaki tesis de doğrudan gönderilebilir: misafir görünürlüğü status'e değil
// publishedSnapshot'a bağlı (bkz. @/lib/hotel-visibility), yani inceleme süresince
// tesis canlı kalır ve misafir onaylanmış son sürümü görmeye devam eder.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/transaction";
import { buildHotelContentSnapshot } from "@/lib/hotel-content-snapshot";
import { contactLeakMessage, findContactLeaks } from "@/lib/content-contact-check";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, guard.hotel.id)).limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  // Tek engel: bekleyen ve hâlâ güncel bir gönderim varsa tekrar gönderme.
  // Taslak o gönderimden sonra değiştiyse (bayat gönderim) yeniden gönderilebilir.
  if (hotel.status === "incelemede" && hotel.submittedRevision === hotel.draftRevision) {
    return NextResponse.json(
      { ok: false, error: "Bu sürüm zaten incelemede." },
      { status: 409 },
    );
  }

  // Yayına gidecek metinlerde telefon/e-posta/web adresi olamaz: misafir
  // tesise yalnız Dengizek üzerinden ulaşır.
  const leaks = findContactLeaks(await buildHotelContentSnapshot(db, guard.hotel.id));
  if (leaks.length > 0) {
    return NextResponse.json(
      { ok: false, error: contactLeakMessage(leaks), code: "CONTACT_INFO", fields: leaks },
      { status: 400 },
    );
  }

  const updated = await withTransaction(async (tx) => {
    const [lockedHotel] = await tx.select().from(hotelsTable).where(eq(hotelsTable.id, guard.hotel.id)).for("update");
    if (!lockedHotel) throw new Error("Tesis bulunamadı.");
    const snapshot = await buildHotelContentSnapshot(tx, guard.hotel.id);
    const [row] = await tx.update(hotelsTable).set({
      status: "incelemede",
      submittedAt: new Date(),
      submittedRevision: lockedHotel.draftRevision,
      submittedSnapshot: snapshot,
      updatedAt: new Date(),
    }).where(eq(hotelsTable.id, guard.hotel.id)).returning();
    return row;
  });

  await logAudit({
    actor: guard.user,
    action: "otel.incelemeye-gonderildi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { eskiDurum: hotel.status, yeniDurum: "incelemede" },
  });

  return NextResponse.json({ ok: true, status: updated.status, submittedRevision: updated.submittedRevision });
}
