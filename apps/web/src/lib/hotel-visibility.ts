// ---------------------------------------------------------------------------
// Misafir görünürlük şartı — TEK kaynak.
//
// Görünürlük `status`'e DEĞİL, **yayınlanmış içerik varlığına** bakar. Böylece
// yayındaki bir tesis yeni sürümünü incelemeye gönderdiğinde marketplace'ten
// düşmez; misafir onaylanmış son snapshot'ı görmeye devam eder. Yeni gönderim
// reddedilse bile eski yayın canlı kalır.
//
// Tesisi tamamen yayından kaldırmanın yolu moderasyon değil, askıya almadır
// (`suspendedAt` — bkz. /api/admin/hotels/[hotelId]/suspend).
//
// status = 'yayinda' kolu, publishedSnapshot'ı olmayan eski (legacy) kayıtlar
// için geriye dönük uyumluluk sağlar — legacySnapshotFallbackEnabled() ile aynı
// mantık.
// ---------------------------------------------------------------------------

import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { hotelsTable } from "@/lib/db/schema";

/** Misafire görünen tesisler için WHERE parçası. */
export function guestVisibleHotelWhere() {
  return and(
    or(isNotNull(hotelsTable.publishedSnapshot), eq(hotelsTable.status, "yayinda")),
    isNull(hotelsTable.suspendedAt),
  );
}

/** Tek tesis için: slug eşleşmesi + görünürlük. */
export function guestVisibleHotelBySlugWhere(slug: string) {
  return and(eq(hotelsTable.slug, slug), guestVisibleHotelWhere());
}
