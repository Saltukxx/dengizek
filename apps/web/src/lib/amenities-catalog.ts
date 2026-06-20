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

/** Anahtar için Türkçe etiket — katalogda yoksa anahtarın kendisi döner. */
export function amenityLabel(key: string): string {
  return labelByKey.get(key) ?? key;
}

/** Seçili anahtarları katalog kategorilerine göre gruplar (özel anahtarlar "Diğer"e). */
export function groupAmenities(keys: string[]): AmenityCategory[] {
  const selected = new Set(keys);
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
