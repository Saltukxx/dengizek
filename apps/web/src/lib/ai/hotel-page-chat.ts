// ---------------------------------------------------------------------------
// Otel sayfası sohbeti — turdaki rehberle aynı motor (/api/tour/chat), tur
// olmadan. Sunucu bu kimliği görünce tek adımlı bir "genel bakış" turu
// kurar; aktarılan otellerin doğruluk eval'ı da tam olarak bu kurguyu ölçer
// (bkz. evals/imported-hotels.eval.ts).
//
// Bu dosya istemci ve sunucu tarafından paylaşılır; sunucu importu yoktur.
// ---------------------------------------------------------------------------

import type { TourManifest } from "@/lib/schemas/tour-manifest";

/**
 * Gerçek tur kimlikleri yalnız küçük harf, rakam ve tire içerir
 * (bkz. tourCreateSchema). Alt çizgi bu kimliğin bir turla çakışmasını
 * imkânsız kılar.
 */
export const HOTEL_PAGE_TOUR_ID = "_otel-sayfasi";
export const HOTEL_PAGE_STEP_ID = "s1";

/** "Kendin dene" (pazarlama sayfası) sohbetinde ziyaretçi başına saatlik soru hakkı. */
export const DEMO_QUESTION_LIMIT = 3;

export function isHotelPageChat(tourId: string): boolean {
  return tourId === HOTEL_PAGE_TOUR_ID;
}

/** Otel sayfası sohbeti için tek adımlı sanal tur manifesti. */
export function hotelPageManifest(hotelSlug: string): TourManifest {
  return {
    tourId: HOTEL_PAGE_TOUR_ID,
    hotelSlug,
    version: 1,
    steps: [
      {
        stepId: HOTEL_PAGE_STEP_ID,
        order: 0,
        kind: "lobby",
        title: "Genel bakış",
        requiresUserContinue: false,
        media: { mode: "clip", src: "/demo.mp4" },
      },
    ],
  };
}

/** Hazır soru üretmek için gereken otel verisi (PublishedHotelContent'in alt kümesi). */
export interface HotelChatStarterInput {
  rooms: Array<{ priceOnRequest: boolean | null; priceMinor: number | null }>;
  restaurants: unknown[];
  amenities: string[];
  specs: {
    checkInTime: string | null;
    checkOutTime: string | null;
    cancellationPolicy: string | null;
    childPolicy: string | null;
    petsAllowed: boolean | null;
    airportDistanceKm: number | null;
  };
}

/**
 * Sohbet açılınca önerilen sorular — yalnız otelin yayındaki verisinde
 * cevabı olan konular. Cevabı olmayan bir öneri misafiri "bilgim yok"
 * yanıtına götürürdü.
 */
export function hotelChatStarters(content: HotelChatStarterInput, limit = 4): string[] {
  const { rooms, restaurants, amenities, specs } = content;
  const hasPricedRoom = rooms.some((r) => !r.priceOnRequest && (r.priceMinor ?? 0) > 0);
  const candidates: Array<[boolean, string]> = [
    [hasPricedRoom, "Oda fiyatları ne kadar?"],
    [!hasPricedRoom && rooms.length > 0, "Hangi oda tipleri var?"],
    [Boolean(specs.checkInTime || specs.checkOutTime), "Giriş ve çıkış saatleri ne?"],
    [amenities.length > 0, "Hangi olanaklar var?"],
    [restaurants.length > 0, "Restoranda neler var?"],
    [Boolean(specs.cancellationPolicy), "İptal koşulları neler?"],
    [Boolean(specs.childPolicy), "Çocuklar için fiyat politikası nedir?"],
    [specs.petsAllowed != null, "Evcil hayvan kabul ediliyor mu?"],
    [specs.airportDistanceKm != null, "Havalimanına ne kadar uzak?"],
  ];
  return candidates.filter(([ok]) => ok).map(([, q]) => q).slice(0, limit);
}
