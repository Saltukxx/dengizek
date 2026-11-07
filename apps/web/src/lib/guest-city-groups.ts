import type { BrowseHotelRow } from "@/lib/hotels-repo";

/**
 * Aynı ilin iki yazımı ("Afyon" / "Afyonkarahisar") tek satırda toplanır.
 * Bağlantı kısa yazımı arar; liste araması "içerir" ile çalıştığı için iki
 * yazımı da bulur.
 */
const CITY_ALIASES: Record<string, { label: string; query: string }> = {
  afyon: { label: "Afyonkarahisar", query: "Afyon" },
  afyonkarahisar: { label: "Afyonkarahisar", query: "Afyon" },
};

/**
 * İl adının kısa yazımı resmî ada çevrilir ("Afyon" → "Afyonkarahisar") —
 * içe aktarmada kullanılır; aynı il şehir listelerinde iki ayrı satır olmasın.
 */
export function normalizeProvince(city: string | null): string | null {
  if (!city) return city;
  const trimmed = city.trim();
  return CITY_ALIASES[trimmed.toLocaleLowerCase("tr-TR")]?.label ?? trimmed;
}

export type CityGroup = { label: string; query: string; count: number };

/** Yayındaki otelleri şehre göre sayar; en kalabalık `limit` şehri döner. */
export function topCities(hotels: Pick<BrowseHotelRow, "city">[], limit = 6): CityGroup[] {
  const byCity = new Map<string, CityGroup>();
  for (const h of hotels) {
    const city = h.city?.trim();
    if (!city) continue;
    const alias = CITY_ALIASES[city.toLocaleLowerCase("tr-TR")];
    const label = alias?.label ?? city;
    const entry = byCity.get(label) ?? { label, query: alias?.query ?? city, count: 0 };
    entry.count += 1;
    byCity.set(label, entry);
  }
  return [...byCity.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
