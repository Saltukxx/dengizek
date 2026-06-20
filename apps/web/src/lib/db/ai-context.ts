// ---------------------------------------------------------------------------
// AI rehber bağlamı — panelde tanımlanan içerikten (odalar, restoranlar,
// ekstralar, olanaklar) kompakt Türkçe gerçek satırları üretir.
// Satır sayısı token kontrolü için sınırlandırılır (~50).
// DATABASE_URL yoksa boş dizi döner — mock gerçekler bozulmaz.
// ---------------------------------------------------------------------------

import { amenityLabel } from "@/lib/amenities-catalog";
import {
  applyDiscount,
  formatDateRangeTr,
  formatPrice,
  resolveCurrentRate,
  todayIso,
} from "@/lib/price";
import { boardTypeLabels, paymentMethodLabels } from "@/lib/schemas/hotel-content";

const MAX_FACTS = 50;
const MAX_MENU_ITEMS_PER_RESTAURANT = 6;

/**
 * Otelin yayınlanmış içeriğinden AI rehbere verilecek gerçek satırlarını üretir.
 * Örn: "Oda: Deniz Manzaralı Deluxe — 32 m², 2 yetişkin, 1 king yatak, ₺4.500/gece"
 */
export async function getHotelAiFacts(hotelSlug: string): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const { getPublishedHotelContent } = await import("@/lib/hotels-repo");
    const content = await getPublishedHotelContent(hotelSlug);
    const facts: string[] = [];

    // Tesis özellikleri
    const { specs } = content;
    const specParts: string[] = [];
    if (specs.starRating != null) specParts.push(`${specs.starRating} yıldızlı`);
    if (specs.totalRooms != null) specParts.push(`${specs.totalRooms} odalı`);
    if (specParts.length > 0) facts.push(`Otel ${specParts.join(", ")} bir tesistir.`);
    if (specs.checkInTime) facts.push(`Check-in saati: ${specs.checkInTime}`);
    if (specs.checkOutTime) facts.push(`Check-out saati: ${specs.checkOutTime}`);

    // Olanaklar — tek özet satır
    if (content.amenities.length > 0) {
      const labels = content.amenities.slice(0, 25).map(amenityLabel);
      facts.push(`Otel olanakları: ${labels.join(", ")}.`);
    }

    // Odalar
    for (const room of content.rooms) {
      const parts: string[] = [];
      if (room.sizeSqm != null) parts.push(`${room.sizeSqm} m²`);
      parts.push(
        `${room.capacityAdults} yetişkin${room.capacityChildren ? ` + ${room.capacityChildren} çocuk` : ""}`,
      );
      if (room.bedConfig) parts.push(room.bedConfig);
      if (room.viewType) parts.push(room.viewType);
      if (room.boardType && room.boardType !== "sadece-oda") {
        parts.push(
          boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? room.boardType,
        );
      }
      if (room.unitCount != null) parts.push(`${room.unitCount} adet`);

      // Bugün geçerli fiyat (dönem varsa dönem fiyatı) + indirim
      const rate = resolveCurrentRate(room, room.rates);
      if (rate.priceOnRequest || rate.priceMinor == null) {
        parts.push("fiyat talep üzerine");
      } else if (room.discountPercent) {
        const discounted = applyDiscount(rate.priceMinor, room.discountPercent);
        parts.push(
          `${formatPrice(discounted, rate.currency, false)}/gece (%${room.discountPercent} indirimli, normal ${formatPrice(rate.priceMinor, rate.currency, false)})`,
        );
      } else {
        parts.push(`${formatPrice(rate.priceMinor, rate.currency, false)}/gece`);
      }
      if (rate.minStayNights != null) parts.push(`en az ${rate.minStayNights} gece`);
      facts.push(`Oda: ${room.name} — ${parts.join(", ")}.`);

      if (room.pricingNotes) {
        facts.push(`${room.name} fiyat notu: ${room.pricingNotes}`);
      }

      // En yakın 2 gelecek/aktif dönem özeti
      const today = todayIso();
      const upcoming = room.rates.filter((r) => r.endDate >= today).slice(0, 2);
      if (upcoming.length > 0) {
        const lines = upcoming.map(
          (r) =>
            `${r.name} (${formatDateRangeTr(r.startDate, r.endDate)}): ${formatPrice(r.priceMinor, r.currency, false)}/gece`,
        );
        facts.push(`${room.name} dönem fiyatları: ${lines.join("; ")}.`);
      }
    }

    // Restoranlar + öne çıkan menü ürünleri
    for (const restaurant of content.restaurants) {
      const info: string[] = [];
      if (restaurant.cuisine) info.push(restaurant.cuisine);
      if (restaurant.hours) info.push(`saatler: ${restaurant.hours}`);
      if (restaurant.location) info.push(restaurant.location);
      facts.push(
        `Restoran: ${restaurant.name}${info.length ? ` — ${info.join(", ")}` : ""}.`,
      );

      const items = restaurant.menu
        .flatMap((section) => section.items)
        .slice(0, MAX_MENU_ITEMS_PER_RESTAURANT);
      if (items.length > 0) {
        const itemLines = items.map((item) => {
          const price = item.priceOnRequest
            ? ""
            : ` (${formatPrice(item.priceMinor, item.currency, false)})`;
          return `${item.name}${price}`;
        });
        facts.push(`${restaurant.name} menüsünden: ${itemLines.join(", ")}.`);
      }
    }

    // Ekstralar
    for (const extra of content.extras) {
      const unit = extra.unitLabel ? ` ${extra.unitLabel}` : "";
      let price = formatPrice(extra.priceMinor, extra.currency, extra.priceOnRequest);
      if (extra.discountPercent && !extra.priceOnRequest && extra.priceMinor != null) {
        const discounted = applyDiscount(extra.priceMinor, extra.discountPercent);
        price = `${formatPrice(discounted, extra.currency, false)} (%${extra.discountPercent} indirimli, normal ${formatPrice(extra.priceMinor, extra.currency, false)})`;
      }
      facts.push(`Ek hizmet: ${extra.name} — ${price}${unit}.`);
    }

    // Politikalar ve iletişim
    if (specs.cancellationPolicy) facts.push(`İptal politikası: ${specs.cancellationPolicy}`);
    if (specs.childPolicy) facts.push(`Çocuk politikası: ${specs.childPolicy}`);
    if (specs.petsAllowed !== null) {
      facts.push(
        specs.petsAllowed ? "Evcil hayvan kabul edilir." : "Evcil hayvan kabul edilmez.",
      );
    }
    if (specs.paymentMethods.length > 0) {
      const labels = specs.paymentMethods.map(
        (m) => paymentMethodLabels[m as keyof typeof paymentMethodLabels] ?? m,
      );
      facts.push(`Ödeme yöntemleri: ${labels.join(", ")}.`);
    }
    if (specs.address) facts.push(`Adres: ${specs.address}`);
    if (specs.phone) facts.push(`Telefon: ${specs.phone}`);
    if (specs.airportDistanceKm != null) {
      facts.push(`Havalimanına uzaklık: ${specs.airportDistanceKm} km.`);
    }

    return facts.slice(0, MAX_FACTS);
  } catch (err) {
    console.warn("[ai-context] İçerik gerçekleri üretilemedi:", err);
    return [];
  }
}
