// ---------------------------------------------------------------------------
// Misafir sayfası veri önbelleği.
//
// Yayındaki otel verisi (snapshot, yorumlar, turlar) yalnız yayın, askıya
// alma ve moderasyonla değişir; her ziyarette veritabanına gitmeye gerek
// yok. Okumalar etiketli önbellekten gelir, bu olaylar etiketi yeniler
// (revalidateGuestHotel). Bir yenileme unutulursa veri en geç
// GUEST_CACHE_TTL_SECONDS sonra kendiliğinden tazelenir; tarihe bağlı
// fiyatlar (dönemsel fiyat, kampanya) da bu süreyle güncel kalır.
//
// Yalnız production'da açık: geliştirmede eski (snapshot'sız) oteller canlı
// tablolardan okunur, panel değişikliği misafir sayfasında hemen görünmeli.
// Next dışında (eval, betik, test) unstable_cache çalışmaz; orada atlanır.
// ---------------------------------------------------------------------------

import { revalidateTag, unstable_cache } from "next/cache";

export const GUEST_CACHE_TTL_SECONDS = 600;

/** Liste sayfaları (anasayfa, oteller, kış vitrini, arama dizini). */
export const GUEST_HOTEL_LIST_TAG = "misafir-oteller";

/** Tek otelin misafir verisi (sayfa, odalar, yorumlar, turlar). */
export function guestHotelTag(slug: string): string {
  return `misafir-otel:${slug}`;
}

export function guestCacheEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.NEXT_RUNTIME) &&
    process.env.GUEST_DATA_CACHE !== "off"
  );
}

/**
 * Fonksiyonu etiketli önbelleğe sarar. Argümanlar anahtarın parçasıdır;
 * sonuç JSON olarak saklanır (Date → metin), bu yüzden yalnız JSON'a
 * dönüşebilen veri döndüren fonksiyonlar sarılmalıdır.
 */
export function guestCached<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R>,
  tags: (...args: Args) => string[],
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    if (!guestCacheEnabled()) return fn(...args);
    // undefined JSON'a yazılamaz ("otel yok" sonucu) — null olarak saklanır.
    const stored = await unstable_cache(async () => (await fn(...args)) ?? null, [name, JSON.stringify(args)], {
      tags: tags(...args),
      revalidate: GUEST_CACHE_TTL_SECONDS,
    })();
    return (stored ?? undefined) as R;
  };
}

/**
 * Otelin misafir verisi değişti (yayın, askı, yorum/tur moderasyonu).
 * Slug verilmezse yalnız listeler yenilenir. Önbellek kapalıyken ya da
 * Next dışında sessizce bir şey yapmaz.
 */
export function revalidateGuestHotel(...slugs: Array<string | null | undefined>): void {
  if (!guestCacheEnabled()) return;
  try {
    revalidateTag(GUEST_HOTEL_LIST_TAG);
    for (const slug of new Set(slugs)) if (slug) revalidateTag(guestHotelTag(slug));
  } catch (err) {
    // Yenileme başarısızsa veri TTL sonunda tazelenir; isteği düşürmeyiz.
    console.warn("[guest-cache] önbellek yenilenemedi:", err);
  }
}

/** revalidateGuestHotel, elde yalnız otel kimliği varken (yorum, gizlilik silmesi). */
export async function revalidateGuestHotelById(hotelId: string | null | undefined): Promise<void> {
  if (!guestCacheEnabled() || !hotelId) return;
  try {
    const { getDb } = await import("@/lib/db");
    const { hotelsTable } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select({ slug: hotelsTable.slug })
      .from(hotelsTable)
      .where(eq(hotelsTable.id, hotelId))
      .limit(1);
    revalidateGuestHotel(row?.slug);
  } catch (err) {
    console.warn("[guest-cache] otel bulunamadı, önbellek yenilenemedi:", err);
  }
}
