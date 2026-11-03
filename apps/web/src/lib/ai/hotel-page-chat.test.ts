import { describe, expect, it } from "vitest";
import { HOTEL_PAGE_TOUR_ID, hotelChatStarters, hotelPageManifest, isHotelPageChat } from "./hotel-page-chat";
import { tourManifestSchema } from "@/lib/schemas/tour-manifest";

const emptySpecs = {
  checkInTime: null,
  checkOutTime: null,
  cancellationPolicy: null,
  childPolicy: null,
  petsAllowed: null,
  airportDistanceKm: null,
};

describe("otel sayfası sohbeti", () => {
  it("sanal tur manifesti şemaya uyar ve kimliği gerçek tur kimliği olamaz", () => {
    expect(tourManifestSchema.safeParse(hotelPageManifest("ornek-otel")).success).toBe(true);
    expect(isHotelPageChat(HOTEL_PAGE_TOUR_ID)).toBe(true);
    // Gerçek tur kimlikleri yalnız küçük harf, rakam ve tire içerir.
    expect(/^[a-z0-9-]+$/.test(HOTEL_PAGE_TOUR_ID)).toBe(false);
  });

  it("hazır soruları yalnız verisi olan konulardan seçer", () => {
    const starters = hotelChatStarters({
      rooms: [{ priceOnRequest: true, priceMinor: null }],
      restaurants: [],
      amenities: ["Termal Havuz"],
      specs: { ...emptySpecs, petsAllowed: false },
    });
    expect(starters).toEqual(["Hangi oda tipleri var?", "Hangi olanaklar var?", "Evcil hayvan kabul ediliyor mu?"]);
    expect(starters).not.toContain("Giriş ve çıkış saatleri ne?");
  });

  it("fiyatlı odada fiyat sorusunu önerir ve sınırı uygular", () => {
    const starters = hotelChatStarters({
      rooms: [{ priceOnRequest: false, priceMinor: 300_000 }],
      restaurants: [{}],
      amenities: ["spa-merkezi"],
      specs: { ...emptySpecs, checkInTime: "14:00", cancellationPolicy: "48 saat" },
    });
    expect(starters).toHaveLength(4);
    expect(starters[0]).toBe("Oda fiyatları ne kadar?");
    expect(starters).not.toContain("Hangi oda tipleri var?");
  });
});
