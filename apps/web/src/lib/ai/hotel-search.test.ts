import { describe, expect, it } from "vitest";
import { airportDistanceFromTexts, conceptEvidence, correctTypos, isFollowUp, parseSearchQuery, searchHotels, type SearchIndexHotel } from "@/lib/ai/hotel-search";

const hotel = (over: Partial<SearchIndexHotel>): SearchIndexHotel => ({
  slug: "x", name: "X", city: null, address: null, imageUrl: null, starRating: null, amenities: [], petsAllowed: null,
  rooms: [], texts: [], airportKm: null, ...over,
});

const INDEX: SearchIndexHotel[] = [
  hotel({
    slug: "a", name: "Afyon Termal", city: "Afyonkarahisar", address: "Afyonkarahisar / Merkez",
    amenities: ["Çocuk Havuzu", "Fitness Center", "Türk Hamamı"], airportKm: 37,
    rooms: [{ name: "Aile Odası", capacityAdults: 2, capacityChildren: 3, boardType: "yarim-pansiyon" }],
  }),
  hotel({
    slug: "b", name: "Afyon Kaplıca", city: "Afyon", address: "Afyon / Gazlıgöl", amenities: ["Termal Havuz", "Sauna"],
    petsAllowed: false, rooms: [{ name: "Standart", capacityAdults: 2, capacityChildren: 0, boardType: "hersey-dahil" }],
  }),
  hotel({
    slug: "c", name: "Denizli Spa", city: "Denizli", address: "Denizli / Pamukkale", amenities: ["Spa", "Jakuzi"], petsAllowed: true,
    texts: ["Tesiste mini golf alanı bulunur."], airportKm: 65,
  }),
  hotel({ slug: "d", name: "Yalova Thermal", city: "Yalova", address: "Yalova / Termal", amenities: ["Spa"] }),
];

const slugs = (q: string) => searchHotels(q, INDEX).results.map((r) => r.slug);

describe("otel arama asistanı", () => {
  it("şehir + olanak: Afyon kısaltması Afyonkarahisar'ı da kapsar", () => {
    expect(slugs("Afyon'da çocuk havuzu olan otel")).toEqual(["a"]);
    expect(slugs("Afyonda termal havuzlu otel")).toEqual(["b"]);
    expect(searchHotels("Afyon'da çocuk havuzu olan otel", INDEX).summary).toBe("Çocuk havuzu olan, Afyon bölgesinde 1 otel buldum.".replace("Afyon", "Afyonkarahisar"));
  });

  it("eş anlamlı ve -lı eki: spor salonu, hamamlı", () => {
    expect(slugs("spor salonu ve hamamı olan otel")).toEqual(["a"]);
    expect(slugs("hamamlı otel")).toEqual(["a"]);
  });

  it("evcil hayvan, kişi sayısı, pansiyon", () => {
    expect(slugs("evcil hayvan kabul eden otel")).toEqual(["c"]);
    expect(slugs("5 kişilik oda")).toEqual(["a"]);
    expect(slugs("aile odası olan otel")).toEqual(["a"]);
    expect(slugs("her şey dahil otel")).toEqual(["b"]);
  });

  it("havalimanına yakın: 50 km içi, mesafeye göre", () => {
    expect(slugs("havalimanına yakın otel")).toEqual(["a"]);
  });

  it("olanak listede yoksa otel metninde geçmesi de sayılır (belirtilerek)", () => {
    const res = searchHotels("golf sahası olan otel", INDEX);
    expect(res.results.map((r) => r.slug)).toEqual(["c"]);
    expect(res.results[0]!.matched[0]).toContain("otel açıklamasında");
    expect(res.query.unknown).toEqual([]);
  });

  it("genel kelime yer adı sayılmaz: 'termal' ≠ Yalova/Termal; 'deniz' ≠ Denizli", () => {
    expect(parseSearchQuery("termal otel", ["yalova", "termal", "denizli"]).places).toEqual([]);
    expect(parseSearchQuery("deniz manzaralı otel", ["denizli"]).places).toEqual([]);
    expect(parseSearchQuery("denizlideki oteller", ["denizli"]).places).toEqual(["denizli"]);
  });

  it("anlaşılmayan kelime açıkça söylenir; tam eşleşme yoksa kısmi sonuç", () => {
    const res = searchHotels("Denizli'de çocuk havuzu olan otel", INDEX);
    expect(res.results).toEqual([]);
    expect(res.partial.map((r) => r.slug)).toContain("c");
    expect(res.summary).toContain("bulamadım");
    expect(searchHotels("deniz manzaralı otel", INDEX).summary).toContain("“manzaralı”");
  });

  it("hiçbir şey anlaşılmazsa örnek önerir", () => {
    expect(searchHotels("merhaba", INDEX).summary).toContain("Ne aradığınızı anlayamadım");
  });

  it("metinden havalimanı mesafesi", () => {
    expect(airportDistanceFromTexts(["Zafer Havaalanına 37 km\nEsenboğa Havalimanı 257 km"])).toBe(37);
    expect(airportDistanceFromTexts(["Koca Seyit Havaalanına 25 kilometre"])).toBe(25);
    expect(airportDistanceFromTexts(["Merkeze 5 km"])).toBeNull();
  });

  describe("takip soruları", () => {
    it.each(["Bunlardan hangisi havalimanına yakın?", "Peki Denizli'de?", "Sadece fitness olanlar", "Which of these has a sauna?"])("%s → takip", (q) => {
      expect(isFollowUp(q)).toBe(true);
    });
    it.each(["Afyon'da çocuk havuzu olan otel", "Spa olan otel"])("%s → yeni arama", (q) => {
      expect(isFollowUp(q)).toBe(false);
    });

    it("olanaklar birikir: Afyon + çocuk havuzu → bunlardan fitness olanlar", () => {
      const res = searchHotels("Bunlardan fitness olanlar", INDEX, ["Afyon'da çocuk havuzu olan otel"]);
      expect(res.chain).toEqual(["Afyon'da çocuk havuzu olan otel", "Bunlardan fitness olanlar"]);
      expect(res.results.map((r) => r.slug)).toEqual(["a"]);
      expect(res.query.amenities.map((a) => a.phrase)).toEqual(["cocuk havuzu", "fitness"]);
    });

    it("yeni şehir eskisinin yerine geçer", () => {
      const res = searchHotels("Peki Denizli'de?", INDEX, ["Spa olan otel"]);
      expect(res.query.places).toEqual(["denizli"]);
      expect(res.results.map((r) => r.slug)).toEqual(["c"]);
    });

    it("havalimanı sorusu en yakını söyler", () => {
      const res = searchHotels("Bunlardan hangisi havalimanına yakın?", INDEX, ["Afyon'da otel"]);
      expect(res.summary).toContain("En yakını: Afyon Termal (37 km)");
    });

    it("takip ifadesi yoksa önceki arama unutulur", () => {
      const res = searchHotels("Spa olan otel", INDEX, ["Afyon'da çocuk havuzu olan otel"]);
      expect(res.chain).toEqual(["Spa olan otel"]);
      expect(res.query.places).toEqual([]);
    });
  });

  describe("yazım hatası", () => {
    const places = ["afyonkarahisar", "afyon", "denizli", "pamukkale", "yalova", "bay"];

    it.each([
      ["fitnees olan otel", "fitness"],
      ["otoprakı olan otel", "otopark"],
      ["Afyonkarahisr'da otel", "afyonkarahisar"],
      ["pamukalede otel", "pamukkale"],
      ["jakkuzi olan otel", "jakuzi"],
      ["asansörlü otel", null],
    ])("%s → %s", (query, expected) => {
      const { corrections } = correctTypos(query, places);
      if (expected) expect(corrections.map((c) => c.to).join(" ")).toContain(expected);
      else expect(corrections).toEqual([]);
    });

    it("kısa kelime ve doğru kelime düzeltilmez", () => {
      expect(correctTypos("bay havuzu olan otel", places).corrections).toEqual([]);
      expect(correctTypos("Denizli'de spa", places).corrections).toEqual([]);
      expect(correctTypos("deniz manzaralı", places).corrections).toEqual([]);
    });

    it("düzeltilen arama sonuç verir ve misafire söylenir", () => {
      const res = searchHotels("Afyonkarahisr'da fitnees olan otel", INDEX);
      expect(res.results.map((r) => r.slug)).toEqual(["a"]);
      expect(res.summary).toContain("“fitnees” → “fitness”");
    });
  });

  describe("puanlı kavramlar", () => {
    const kids = hotel({
      slug: "k", name: "Kids", amenities: ["Çocuk Havuzu", "Mini Club", "Aquapark", "Sauna"],
      rooms: [{ name: "Aile Odası", capacityAdults: 2, capacityChildren: 2, boardType: null }],
    });
    const oneKid = hotel({ slug: "o", name: "One", amenities: ["Çocuk Havuzu", "Sauna"] });
    const honeymoon = hotel({ slug: "h", name: "Honey", amenities: ["Spa"], texts: ["Balayı Konsepti: Odaya meyve sepeti"] });
    const spaOnly = hotel({ slug: "s", name: "Spa", amenities: ["Spa", "Masaj", "Jakuzi"] });
    const idx = [kids, oneKid, honeymoon, spaOnly];

    it("çocuk dostu: en az 2 kanıt (tek çocuk havuzu yetmez); kanıtlar gösterilir", () => {
      const res = searchHotels("çocuklarla gidilecek otel", idx);
      expect(res.results.map((r) => r.slug)).toEqual(["k"]);
      expect(conceptEvidence(kids, "cocuk-dostu")).toEqual(["Çocuk Havuzu", "Mini Club", "Aquapark", "Aile Odası"]);
      expect(res.summary).toContain("Çocuk dostu 1 otel buldum");
    });

    it("balayı: otel metninde balayı geçmesi yeter; birkaç spa olanağı yetmez", () => {
      const res = searchHotels("balayı için romantik otel", idx);
      expect(res.results.map((r) => r.slug)).toEqual(["h"]);
      expect(res.results[0]!.matched[0]).toContain("Balayı konsepti (otel açıklamasında)");
      expect(res.summary).toContain("Balayına uygun 1 otel buldum");
    });

    it("kanıtlanamayan istek anlaşılmış sayılmaz", () => {
      expect(searchHotels("sakin bir otel", idx).summary).toContain("“sakin”");
    });

    it("çocuk havuzu sorusu kavram değil olanaktır", () => {
      expect(parseSearchQuery("çocuk havuzu olan otel", []).concepts).toEqual([]);
    });
  });

  it("bölge adı: Kapadokya → Nevşehir", () => {
    expect(parseSearchQuery("Kapadokya'da otel", ["nevsehir", "denizli"]).places).toEqual(["nevsehir"]);
  });

  it("denize sıfır olanak olarak aranır", () => {
    const idx = [hotel({ slug: "z", name: "Z", amenities: ["Denize Sıfır"] }), hotel({ slug: "y", name: "Y", amenities: ["Plaj Bar"] })];
    expect(searchHotels("denize sıfır otel", idx).results.map((r) => r.slug)).toEqual(["z"]);
    const res = searchHotels("denize sıfır otel", idx);
    expect(res.query.unknown).toEqual([]);
    expect(res.summary).toContain("Denize sıfır olan 1 otel");
  });
});
