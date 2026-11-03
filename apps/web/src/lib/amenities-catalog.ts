// ---------------------------------------------------------------------------
// Olanak kataloğu — kategorilere ayrılmış standart anahtarlar.
// DB'de yalnızca anahtar (key) saklanır; UI etiketleri buradan okunur.
// Katalogda olmayan serbest metin anahtarlar da geçerlidir (etiket = anahtar).
// ---------------------------------------------------------------------------

export interface AmenityCategory {
  category: string;
  items: { key: string; label: string }[];
}

export const amenitiesCatalog: AmenityCategory[] = [
  {
    category: "Genel",
    items: [
      { key: "ucretsiz-wifi", label: "Ücretsiz Wi-Fi" },
      { key: "klima", label: "Klima" },
      { key: "resepsiyon-7-24", label: "7/24 Resepsiyon" },
      { key: "oda-servisi", label: "Oda servisi" },
      { key: "concierge", label: "Concierge" },
      { key: "kasa", label: "Oda kasası" },
      { key: "camasirhane", label: "Çamaşırhane" },
      { key: "evcil-hayvan", label: "Evcil hayvan kabul edilir" },
    ],
  },
  {
    category: "Havuz & Plaj",
    items: [
      { key: "acik-havuz", label: "Açık havuz" },
      { key: "kapali-havuz", label: "Kapalı havuz" },
      { key: "cocuk-havuzu", label: "Çocuk havuzu" },
      { key: "ozel-plaj", label: "Özel plaj" },
      { key: "sezlong-semsiye", label: "Şezlong ve şemsiye" },
      { key: "plaj-bari", label: "Plaj barı" },
    ],
  },
  {
    category: "Spa & Sağlık",
    items: [
      { key: "termal-havuz", label: "Termal havuz" },
      { key: "spa-merkezi", label: "Spa merkezi" },
      { key: "hamam", label: "Hamam" },
      { key: "sauna", label: "Sauna" },
      { key: "masaj", label: "Masaj" },
      { key: "fitness", label: "Fitness salonu" },
      { key: "jakuzi", label: "Jakuzi" },
    ],
  },
  {
    category: "Yeme-İçme",
    items: [
      { key: "restoran", label: "Restoran" },
      { key: "bar", label: "Bar" },
      { key: "kahvalti-dahil", label: "Kahvaltı dahil" },
      { key: "her-sey-dahil", label: "Her şey dahil seçeneği" },
      { key: "snack-bar", label: "Snack bar" },
      { key: "ozel-yemek", label: "Özel diyet menüleri" },
    ],
  },
  {
    category: "Aile",
    items: [
      { key: "cocuk-kulubu", label: "Çocuk kulübü" },
      { key: "bebek-bakimi", label: "Bebek bakım hizmeti" },
      { key: "oyun-alani", label: "Oyun alanı" },
      { key: "aile-odalari", label: "Aile odaları" },
    ],
  },
  {
    category: "Aktiviteler",
    items: [
      { key: "su-sporlari", label: "Su sporları" },
      { key: "tenis", label: "Tenis kortu" },
      { key: "bisiklet", label: "Bisiklet kiralama" },
      { key: "animasyon", label: "Animasyon ekibi" },
      { key: "canli-muzik", label: "Canlı müzik" },
    ],
  },
  {
    category: "Ulaşım",
    items: [
      { key: "otopark", label: "Otopark" },
      { key: "vale", label: "Vale hizmeti" },
      { key: "havalimani-transferi", label: "Havalimanı transferi" },
      { key: "arac-kiralama", label: "Araç kiralama" },
    ],
  },
  {
    category: "Erişilebilirlik",
    items: [
      { key: "engelli-erisimi", label: "Engelli erişimi" },
      { key: "asansor", label: "Asansör" },
      { key: "erisilebilir-oda", label: "Erişilebilir oda" },
    ],
  },
];

const labelByKey = new Map<string, string>(
  amenitiesCatalog.flatMap((c) => c.items.map((i) => [i.key, i.label] as const)),
);

/**
 * Dışarıdan aktarılan tesisler olanakları serbest metinle tutar ("Türk Hamamı",
 * "Termal Havuz"). Katalog etiketi ya da bilinen eş anlamlısı olan metin
 * katalog anahtarına çevrilir; böylece filtreler ve gruplama iki kaynakta da
 * aynı çalışır. Tanınmayan metin olduğu gibi kalır.
 */
const SYNONYMS: Record<string, string> = {
  "türk hamamı": "hamam",
  "spa": "spa-merkezi",
  "spa & wellness": "spa-merkezi",
  "spor salonu": "fitness",
  "fitness center": "fitness",
  "restaurant": "restoran",
  "ana restaurant": "restoran",
  "otopark": "otopark",
  "kapalı otopark": "otopark",
  "açık otopark": "otopark",
  "jakuzi": "jakuzi",
  "asansör": "asansor",
  "çamaşırhane": "camasirhane",
  "kasa": "kasa",
};

const keyByText = new Map<string, string>([
  ...amenitiesCatalog.flatMap((c) =>
    c.items.flatMap((i) => [
      [i.key, i.key] as const,
      [i.label.toLocaleLowerCase("tr-TR"), i.key] as const,
    ]),
  ),
  ...Object.entries(SYNONYMS),
]);

/** Serbest metni ya da anahtarı katalog anahtarına çevirir; tanınmazsa olduğu gibi döner. */
export function amenityKey(value: string): string {
  return keyByText.get(value.trim().toLocaleLowerCase("tr-TR")) ?? value;
}

/** Olanak listesini anahtarlara çevirir, tekrarları atar (sıra korunur). */
export function normalizeAmenities(values: readonly string[]): string[] {
  return [...new Set(values.map(amenityKey))];
}

/**
 * Misafirin otel seçerken gerçekten karşılaştırdığı olanaklar, önem sırasıyla.
 * "Televizyon", "Wc" gibi her otelde olan oda donanımı öne çıkarılmaz.
 */
const HIGHLIGHT_PRIORITY = [
  "termal-havuz",
  "ozel-plaj",
  "hamam",
  "spa-merkezi",
  "cocuk-havuzu",
  "acik-havuz",
  "kapali-havuz",
  "her-sey-dahil",
  "fitness",
  "sauna",
  "cocuk-kulubu",
  "evcil-hayvan",
  "havalimani-transferi",
  "ucretsiz-wifi",
];

/** Öne çıkarılacak en fazla `limit` olanak anahtarı (önem sırasıyla). */
export function highlightAmenityKeys(values: readonly string[], limit: number): string[] {
  const keys = new Set(normalizeAmenities(values));
  return HIGHLIGHT_PRIORITY.filter((k) => keys.has(k)).slice(0, limit);
}

/** Anahtar için Türkçe etiket — katalogda yoksa anahtarın kendisi döner. */
export function amenityLabel(key: string): string {
  return labelByKey.get(amenityKey(key)) ?? key;
}

/** Seçili anahtarları katalog kategorilerine göre gruplar (özel anahtarlar "Diğer"e). */
export function groupAmenities(keys: string[]): AmenityCategory[] {
  const selected = new Set(normalizeAmenities(keys));
  const groups: AmenityCategory[] = [];
  for (const cat of amenitiesCatalog) {
    const items = cat.items.filter((i) => selected.has(i.key));
    if (items.length > 0) groups.push({ category: cat.category, items });
    for (const i of items) selected.delete(i.key);
  }
  if (selected.size > 0) {
    groups.push({
      category: "Diğer",
      items: [...selected].map((key) => ({ key, label: key })),
    });
  }
  return groups;
}
