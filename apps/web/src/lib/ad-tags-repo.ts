// ---------------------------------------------------------------------------
// Reklam kodlarının misafir sayfalarına okunması — kısa süreli bellek önbelleği.
//
// Misafir layout'u her istekte çağırır; kayıt sayısı küçük (sayfa + otel başına
// birkaç kimlik), tümü bir kez okunur ve istemci yola göre süzer. Admin bir
// kaydı değiştirince clearAdTagCache() bu örneğin önbelleğini boşaltır; diğer
// örnekler en geç TTL sonunda güncellenir.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { adTagsTable, hotelsTable } from "@/lib/db/schema";
import type { PublicAdTag } from "@/lib/ad-tags";

const TTL_MS = 60_000;
let cached: { at: number; tags: PublicAdTag[] } | null = null;

export function clearAdTagCache(): void {
  cached = null;
}

export async function getActiveAdTags(): Promise<PublicAdTag[]> {
  if (!isDbConfigured()) return [];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.tags;
  try {
    const rows = await getDb()
      .select({
        pagePath: adTagsTable.pagePath,
        hotelSlug: hotelsTable.slug,
        googleAdsId: adTagsTable.googleAdsId,
        conversionLabel: adTagsTable.conversionLabel,
        ga4Id: adTagsTable.ga4Id,
      })
      .from(adTagsTable)
      .leftJoin(hotelsTable, eq(adTagsTable.hotelId, hotelsTable.id))
      .where(eq(adTagsTable.enabled, true));
    const tags = rows.map((r) => ({ ...r, hotelSlug: r.hotelSlug ?? null }));
    cached = { at: Date.now(), tags };
    return tags;
  } catch (err) {
    // Reklam kodu okunamadı diye misafir sayfası kırılmaz.
    console.warn("[ad-tags] okunamadı:", err);
    return cached?.tags ?? [];
  }
}
