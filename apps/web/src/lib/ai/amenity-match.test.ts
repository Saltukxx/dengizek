import { describe, expect, it } from "vitest";
import { asksAmenityPrice, asksKnownAmenity, matchAmenities } from "@/lib/ai/amenity-match";

// Aktarılan termal otellerdeki gerçek yazımlar.
const ITEMS = [
  "Açık Havuz", "Kapalı Havuz", "Termal Havuz", "Çocuk Havuzu", "Bayan Havuzu", "Bay Havuzu", "Kaydıraklı Havuzu",
  "Jakuzili Havuz", "Fitness Center", "Türk Hamamı", "Aile Hamamı - Banyosu", "Sauna", "Buhar Odası", "Masaj", "Spa",
  "Kese", "Otopark", "Wi - Fi", "İnternet Erişimi", "Asansör", "Split Klima", "Merkezi Klima", "Oda Servisi",
  "Havalimanı Servisi", "Ana Restaurant", "A La Carte Restaurant", "Lobby Bar", "Mini Club", "Çocuk Oyun Alanı",
  "Masa Tenisi", "Tenis Kortu", "Bilardo", "Saç Kurutma Makinesi", "Minibar", "Kasa", "Balkon", "Aquapark",
];

describe("olanak eşleşmesi", () => {
  it.each([
    // Kısmi ad ve eş anlamlılar
    ["fitness var mı?", ["Fitness Center"]],
    ["Spor salonunuz var mı?", ["Fitness Center"]],
    ["Do you have a gym?", ["Fitness Center"]],
    ["Hamam var mı?", ["Türk Hamamı", "Aile Hamamı - Banyosu"]],
    ["Is there a Turkish bath?", ["Türk Hamamı", "Aile Hamamı - Banyosu"]],
    ["Wifi var mı?", ["Wi - Fi", "İnternet Erişimi"]],
    ["İnternet var mı?", ["Wi - Fi", "İnternet Erişimi"]],
    ["Otopark var mı?", ["Otopark"]],
    ["Do you have parking?", ["Otopark"]],
    ["Restoran var mı?", ["Ana Restaurant", "A La Carte Restaurant"]],
    ["Asansör var mı?", ["Asansör"]],
    ["Is there an elevator?", ["Asansör"]],
    ["Odalarda klima var mı?", ["Split Klima", "Merkezi Klima"]],
    ["Çocuk kulübü var mı?", ["Mini Club"]],
    ["Kids club?", ["Mini Club"]],
    ["Jakuzi var mı?", ["Jakuzili Havuz"]],
    // Çok eşleşme ve daraltma
    ["Havuz var mı?", ["Açık Havuz", "Kapalı Havuz", "Termal Havuz", "Çocuk Havuzu", "Bayan Havuzu", "Bay Havuzu", "Kaydıraklı Havuzu", "Jakuzili Havuz"]],
    ["Termal havuz var mı?", ["Termal Havuz"]],
    ["Indoor pool?", ["Kapalı Havuz"]],
    ["Çocuk havuzu var mı?", ["Çocuk Havuzu"]],
    // Benzer ama farklı olanaklar
    ["Bay havuzu var mı?", ["Bay Havuzu"]],
    ["Bayan havuzu var mı?", ["Bayan Havuzu"]],
    ["Masaj var mı?", ["Masaj"]],
    ["Masa tenisi var mı?", ["Masa Tenisi"]],
    ["Tenis kortu var mı?", ["Tenis Kortu"]],
    ["Oda servisi var mı?", ["Oda Servisi"]],
    ["Havalimanı servisi var mı?", ["Havalimanı Servisi"]],
    ["Ücretsiz otopark var mı?", ["Otopark"]],
    // Listede yok
    ["Golf sahası var mı?", []],
    ["Casino var mı?", []],
    ["Plaj var mı?", []],
  ])("%s", (message, expected) => {
    expect(matchAmenities(message, ITEMS)).toEqual(expected);
  });

  it("bilinen olanak kavramını tanır", () => {
    expect(asksKnownAmenity("Spor salonu var mı?")).toBe(true);
    expect(asksKnownAmenity("Is there a pool?")).toBe(true);
    expect(asksKnownAmenity("Manzara nasıl?")).toBe(false);
  });

  it("ücret sorusunu ayırır", () => {
    expect(asksAmenityPrice("Ücretsiz otopark var mı?")).toBe(true);
    expect(asksAmenityPrice("Otopark var mı?")).toBe(false);
  });
});

describe("yer kelimesi ve metin yakınlığı", () => {
  it("'Golf sahası' → 'Mini Golf'", () => {
    expect(matchAmenities("Golf sahası var mı?", ["Mini Golf", "Sauna"])).toEqual(["Mini Golf"]);
    expect(matchAmenities("Oyun alanı var mı?", ["Çocuk Oyun Alanı"])).toEqual(["Çocuk Oyun Alanı"]);
  });

  it("metinde kelimeler ayrı yerlerde geçiyorsa olanak sayılmaz", async () => {
    const { textsMentionAmenity } = await import("@/lib/ai/amenity-match");
    expect(textsMentionAmenity("Çocuk havuzu var mı?", ["Çocuklar için animasyon vardır. Açık havuz yazın açıktır."])).toBe(false);
    expect(textsMentionAmenity("Çocuk havuzu var mı?", ["Tesiste çocuk havuzu bulunur."])).toBe(true);
  });
});

describe("bilinen olanak sorusu (Türkçe kelimeyle)", () => {
  it.each(["Çocuk havuzu var mı?", "Havuz var mı?", "Hamamınız var mı?", "Otopark var mı?", "Golf sahası var mı?"])("%s", (message) => {
    expect(asksKnownAmenity(message)).toBe(true);
  });
  it.each(["Termal var mı?", "Manzara güzel mi?", "Kahvaltı kaçta?"])("%s → olanak sorusu değil", (message) => {
    expect(asksKnownAmenity(message)).toBe(false);
  });
});

describe("ek toleransı bileşik kelimeyi eşlemez", () => {
  it("hava ≠ havalimanı, kese = kesesi", async () => {
    const { suffixMatch } = await import("@/lib/ai/text");
    expect(suffixMatch("hava", "havalimani")).toBe(false);
    expect(suffixMatch("kese", "kesesi")).toBe(true);
    expect(suffixMatch("havuz", "havuzlarinizi")).toBe(true);
    expect(suffixMatch("masa", "masaj")).toBe(false);
  });
});
