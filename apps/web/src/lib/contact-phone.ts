// ---------------------------------------------------------------------------
// Otel iletişim numaraları — misafir sayfasındaki "Ara" ve "WhatsApp"
// düğmeleri için. Numara panelde serbest yazılır ("0 (532) 111 22 33",
// "+90 532…", "532…"); burada uluslararası biçime (905321112233) çevrilir.
// ---------------------------------------------------------------------------

/** Rakamları uluslararası biçime çevirir; geçersizse null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10 && /^[2-5]/.test(digits)) digits = `90${digits}`;
  digits = digits.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Türkiye cep numarası mı? (WhatsApp için sabit hat kullanılmaz) */
export function isTurkishMobile(international: string): boolean {
  return /^905\d{9}$/.test(international);
}

export interface HotelContactLinks {
  tel: string | null;
  whatsapp: string | null;
}

/**
 * Misafire gösterilecek bağlantılar. WhatsApp için önce ayrı WhatsApp
 * numarası, yoksa telefon cep numarasıysa o kullanılır.
 */
export function hotelContactLinks(
  input: { phone: string | null; whatsapp: string | null },
  hotelName: string,
): HotelContactLinks {
  const phone = normalizePhone(input.phone);
  const explicitWa = normalizePhone(input.whatsapp);
  const wa = explicitWa ?? (phone && isTurkishMobile(phone) ? phone : null);
  const text = `Merhaba, Otelsayfam'daki ${hotelName} sayfasından yazıyorum.`;
  return {
    tel: phone ? `tel:+${phone}` : null,
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
  };
}
