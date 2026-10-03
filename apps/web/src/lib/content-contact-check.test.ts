import { describe, expect, it } from "vitest";
import { findContactLeaks } from "./content-contact-check";

const clean = {
  schemaVersion: 1,
  generatedAt: "2026-08-13T18:00:11.335Z",
  hotel: {
    id: "44f49b69-c5af-43d2-a0be-52c4e9528185",
    name: "Kar Zirvesi",
    phone: "+90 224 555 01 00",
    contactEmail: "rezervasyon@karzirvesi.example",
    address: "Oteller Bölgesi No:12, 16355 Uludağ",
    latitude: "40.1123456789",
    longDescription: "Pist yanında, 48 oda. 2019'da yenilendi.",
    aiPolicies: ["Giriş 14:00", "Ücretsiz iptal: 72 saat öncesine kadar"],
    createdAt: "2026-07-30T16:46:49.481Z",
  },
  rooms: [{ id: "r1", name: "Şömineli Suit", imageUrl: "https://images.example.com/a.jpg", description: "38 m² suit." }],
  roomRates: [{ name: "Kış 2026-27", startDate: "2026-11-01", endDate: "2027-03-31" }],
};

describe("findContactLeaks", () => {
  it("platforma özel alanları, kimlikleri, tarihleri ve medya adreslerini taramaz", () => {
    expect(findContactLeaks(clean)).toEqual([]);
  });

  it("serbest metindeki telefonu bölüm ve alan adıyla bildirir", () => {
    const leaks = findContactLeaks({
      ...clean,
      hotel: { ...clean.hotel, longDescription: "Rezervasyon için 0532 123 45 67." },
      rooms: [{ ...clean.rooms[0], description: "Bilgi: otelim.com" }],
    });
    expect(leaks).toEqual(["Tesis bilgileri — uzun açıklama", "Odalar — açıklama"]);
  });

  it("dizi içindeki AI bilgisini ve iç içe menü metnini yakalar", () => {
    const leaks = findContactLeaks({
      hotel: { aiFacts: ["5 yıldız", "Bize ada@example.com yazın"] },
      restaurants: [{ name: "Teras", menu: [{ items: [{ name: "Çorba", description: "Sipariş: @terasotel" }] }] }],
    });
    expect(leaks).toEqual(["Tesis bilgileri — AI bilgileri", "Restoranlar — açıklama"]);
  });

  it("tur manifestinde durak metnini ve üst düzey başlığı tarar", () => {
    const leaks = findContactLeaks(
      {
        title: "Lobi turu — 0532 123 45 67",
        steps: [{ stepId: "s1", media: { src: "https://cdn.example.com/v.m3u8" }, body: "Arayın: 05321234567" }],
      },
      "Tur",
    );
    expect(leaks).toEqual(["Tur — başlık", "Tur durakları — metin"]);
  });
});
