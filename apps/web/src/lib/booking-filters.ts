// ---------------------------------------------------------------------------
// Rezervasyon listesi süzgeçleri — liste ve CSV dışa aktarma aynı koşulu kurar.
// ---------------------------------------------------------------------------

import { and, eq, gte, ilike, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import { bookingsTable } from "@/lib/db/schema";
import { isStayState } from "@/lib/booking-stay";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** LIKE joker karakterlerini düz metne çevirir. */
function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * ?durum= konaklama durumu (bkz. booking-stay), ?q= misafir adı,
 * ?baslangic= & ?bitis= konaklaması bu aralığa değen kayıtlar (uçlar dahil).
 */
export function bookingListFilters(hotelId: string, params: URLSearchParams): SQL[] {
  const filters: SQL[] = [eq(bookingsTable.hotelId, hotelId)];

  const durum = params.get("durum");
  if (isStayState(durum)) {
    if (durum === "onaylandi") {
      filters.push(eq(bookingsTable.status, "onaylandi"), isNull(bookingsTable.checkedInAt));
    } else if (durum === "konakliyor") {
      filters.push(
        eq(bookingsTable.status, "onaylandi"),
        isNotNull(bookingsTable.checkedInAt),
        isNull(bookingsTable.checkedOutAt),
      );
    } else if (durum === "cikis_yapti") {
      filters.push(eq(bookingsTable.status, "onaylandi"), isNotNull(bookingsTable.checkedOutAt));
    } else {
      filters.push(eq(bookingsTable.status, durum));
    }
  }

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = likePattern(q.slice(0, 120));
    // Yalnız misafir adında aranır; e-posta ve telefon panele açık değildir.
    const match = ilike(bookingsTable.guestName, pattern);
    if (match) filters.push(match);
  }

  const from = params.get("baslangic");
  const to = params.get("bitis");
  if (from && DATE.test(from)) filters.push(gte(bookingsTable.checkOut, from));
  if (to && DATE.test(to)) filters.push(lte(bookingsTable.checkIn, to));

  return filters;
}

export function bookingListWhere(hotelId: string, params: URLSearchParams) {
  return and(...bookingListFilters(hotelId, params));
}
