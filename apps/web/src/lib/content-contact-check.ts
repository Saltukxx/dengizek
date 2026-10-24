// ---------------------------------------------------------------------------
// Yayına gidecek içerikte iletişim bilgisi taraması.
//
// Tesis ve tur incelemeye gönderilirken çalışır: açıklama, politika, AI
// bilgisi, durak metni gibi serbest metin alanlarında telefon, e-posta ya da
// web adresi varsa gönderim reddedilir. Yalnız bilinen metin alanlarına
// bakılır; kimlik, tarih, koordinat ve medya adresleri taranmaz.
// ---------------------------------------------------------------------------

import { containsContactInfo } from "@/lib/contact-guard";

const FREE_TEXT_KEYS = new Set([
  "name", "title", "label", "body", "caption", "text", "summary", "notes",
  "shortDescription", "longDescription", "description", "tagline", "pricingNotes",
  "cancellationPolicy", "childPolicy", "blackoutText",
  "aiPersona", "aiFacts", "aiPolicies", "aiDescription", "aiPromo", "aiTags",
  "location", "cuisine", "bedConfig", "viewType", "discountLabel", "unitLabel",
  "amenities", "tags",
]);

const SECTION_LABELS: Record<string, string> = {
  hotel: "Tesis bilgileri",
  rooms: "Odalar",
  roomRates: "Dönemsel fiyatlar",
  restaurants: "Restoranlar",
  extras: "Ekstralar",
  gallery: "Galeri",
  availabilityNotes: "Müsaitlik notları",
  cancellationRules: "İptal kuralları",
  ratePlans: "Fiyat planları",
  ratePlanPrices: "Fiyat planı fiyatları",
  promotions: "Kampanyalar",
  steps: "Tur durakları",
};

const FIELD_LABELS: Record<string, string> = {
  name: "ad", title: "başlık", label: "etiket", body: "metin", caption: "alt yazı",
  shortDescription: "kısa açıklama", longDescription: "uzun açıklama", description: "açıklama",
  tagline: "kısa tanım", pricingNotes: "fiyat notu", cancellationPolicy: "iptal politikası",
  childPolicy: "çocuk politikası", blackoutText: "kapalı dönem metni", aiPersona: "AI rehber adı",
  aiFacts: "AI bilgileri", aiPolicies: "AI politikaları", aiDescription: "AI açıklaması",
  aiPromo: "AI öne çıkanlar", aiTags: "AI etiketleri", location: "konum", notes: "not",
};

function walk(value: unknown, key: string | null, section: string, found: Set<string>) {
  if (typeof value === "string") {
    if (key && FREE_TEXT_KEYS.has(key) && containsContactInfo(value)) {
      found.add(`${section} — ${FIELD_LABELS[key] ?? key}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, key, section, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) walk(child, childKey, section, found);
  }
}

/** İçerikte iletişim bilgisi taşıyan alanların okunur listesi; temizse boş. */
export function findContactLeaks(content: Record<string, unknown>, fallbackSection = "İçerik"): string[] {
  const found = new Set<string>();
  for (const [key, value] of Object.entries(content)) {
    const section = SECTION_LABELS[key] ?? fallbackSection;
    // Üst düzeydeki düz alanlar (ör. tur başlığı) kendi anahtarıyla taranır.
    walk(value, typeof value === "object" && value !== null ? null : key, section, found);
  }
  return [...found];
}

export function contactLeakMessage(leaks: string[]): string {
  return `Misafirle iletişim yalnız Otelsayfam üzerinden kurulur. Şu alanlardan telefon, e-posta, web adresi veya sosyal medya hesabını kaldırın: ${leaks.join("; ")}.`;
}
