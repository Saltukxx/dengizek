// ---------------------------------------------------------------------------
// AI rehber bağlamı — panelde tanımlanan içerikten (odalar, restoranlar,
// ekstralar, olanaklar) kompakt Türkçe gerçek satırları üretir.
// Satır sayısı token kontrolü için sınırlandırılır (~50).
// DATABASE_URL yoksa boş dizi döner — mock gerçekler bozulmaz.
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import type { HotelProfile } from "@/lib/schemas/tour-manifest";

/**
 * Otel profil alanlarını (persona, manuel facts/policies) yayınlanmış
 * snapshot'tan okur — canlı taslak satırdan DEĞİL. Böylece bu alanlar da
 * oda/fiyat/politika içeriği gibi admin onayından geçmeden misafire yansımaz.
 * `publishedSnapshot` yoksa (ör. seed verisi, hiç submit/approve akışından
 * geçmemiş oteller) dev/legacy modda canlı satıra düşer.
 */
export async function getHotelAiProfile(hotelSlug: string): Promise<HotelProfile | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    const { getDb } = await import("@/lib/db");
    const { hotelsTable } = await import("@/lib/db/schema");
    const { parseHotelContentSnapshot } = await import("@/lib/schemas/hotel-content-snapshot");
    const { legacySnapshotFallbackEnabled } = await import("@/lib/hotels-repo");
    const { guestVisibleHotelBySlugWhere } = await import("@/lib/hotel-visibility");
    const db = getDb();

    const [row] = await db
      .select({
        publishedSnapshot: hotelsTable.publishedSnapshot,
        aiPersona: hotelsTable.aiPersona,
        aiLanguage: hotelsTable.aiLanguage,
        aiFacts: hotelsTable.aiFacts,
        aiPolicies: hotelsTable.aiPolicies,
      })
      .from(hotelsTable)
      .where(guestVisibleHotelBySlugWhere(hotelSlug))
      .limit(1);

    if (!row) return undefined;

    const parsed = parseHotelContentSnapshot(row.publishedSnapshot);
    if (parsed.success) {
      const hotel = parsed.data.hotel;
      const value = <T>(key: string, fallback: T) => (key in hotel ? (hotel[key] as T) : fallback);
      const facts = value<string[]>("aiFacts", []);
      const policies = value<string[]>("aiPolicies", []);
      return {
        aiPersona: value("aiPersona", "Yapay Zeka Rehberi"),
        language: value("aiLanguage", "tr"),
        facts: facts.length > 0 ? facts.map(redactContactInfo) : undefined,
        policies: policies.length > 0 ? policies.map(redactContactInfo) : undefined,
      };
    }

    if (!legacySnapshotFallbackEnabled()) return undefined;

    return {
      aiPersona: row.aiPersona,
      language: row.aiLanguage,
      facts: row.aiFacts.length > 0 ? row.aiFacts.map(redactContactInfo) : undefined,
      policies: row.aiPolicies.length > 0 ? row.aiPolicies.map(redactContactInfo) : undefined,
    };
  } catch (err) {
    console.warn("[ai-context] Otel profili okunamadı:", err);
    return undefined;
  }
}
