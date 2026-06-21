// ---------------------------------------------------------------------------
// AI fact kataloğu — doğrulanmış bilgi + otel ifadesi etiketleri
// ---------------------------------------------------------------------------

import { amenityLabel } from "@/lib/amenities-catalog";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";
import type { AiFactCard, AiFactCatalogEntry, AiFactQueryResult } from "@/lib/ai/types";
import { FACT_KIND_LABELS } from "@/lib/ai/types";

function slugifyId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

/** Otel için fact kataloğunu oluşturur (fiyat satırları hariç — fiyat getRoomPrice ile). */
async function buildFactCatalogUncached(hotelSlug: string): Promise<AiFactCatalogEntry[]> {
  const [profile, content] = await Promise.all([
    getHotelAiProfile(hotelSlug),
    getPublishedHotelContent(hotelSlug),
  ]);

  const entries: AiFactCatalogEntry[] = [];

  const { specs } = content;
  if (specs.starRating != null) {
    entries.push({
      id: "spec.star_rating",
      kind: "verified",
      hint: "yıldız sınıfı",
      text: `${specs.starRating} yıldızlı tesis.`,
    });
  }
  if (specs.checkInTime) {
    entries.push({
      id: "spec.check_in",
      kind: "verified",
      hint: "giriş saati check-in",
      text: `Check-in saati: ${specs.checkInTime}`,
    });
  }
  if (specs.checkOutTime) {
    entries.push({
      id: "spec.check_out",
      kind: "verified",
      hint: "çıkış saati check-out",
      text: `Check-out saati: ${specs.checkOutTime}`,
    });
  }
  if (content.amenities.length > 0) {
    const labels = content.amenities.slice(0, 25).map(amenityLabel);
    entries.push({
      id: "spec.amenities",
      kind: "verified",
      hint: "otel olanakları tesis imkanları",
      text: `Otel olanakları: ${labels.join(", ")}.`,
    });
  }
  if (specs.cancellationPolicy) {
    entries.push({
      id: "policy.cancellation",
      kind: "policy",
      hint: "iptal politikası",
      title: "İptal politikası",
      text: specs.cancellationPolicy,
    });
  }
  if (specs.childPolicy) {
    entries.push({
      id: "policy.children",
      kind: "policy",
      hint: "çocuk politikası",
      title: "Çocuk politikası",
      text: specs.childPolicy,
    });
  }
  if (specs.petsAllowed !== null) {
    entries.push({
      id: "policy.pets",
      kind: "policy",
      hint: "evcil hayvan",
      text: specs.petsAllowed ? "Evcil hayvan kabul edilir." : "Evcil hayvan kabul edilmez.",
    });
  }
  if (specs.address) {
    entries.push({
      id: "spec.address",
      kind: "verified",
      hint: "adres konum",
      text: `Adres: ${specs.address}`,
    });
  }
  if (specs.phone) {
    entries.push({
      id: "spec.phone",
      kind: "verified",
      hint: "telefon iletişim",
      text: `Telefon: ${specs.phone}`,
    });
  }

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
    entries.push({
      id: `room.${room.slug}.info`,
      kind: "verified",
      hint: `${room.name} oda özellikleri`,
      title: room.name,
      text: `${room.name}: ${parts.join(", ")}.`,
    });
    if (room.pricingNotes) {
      entries.push({
        id: `room.${room.slug}.pricing_notes`,
        kind: "verified",
        hint: `${room.name} fiyat notu (rakam değil)`,
        title: room.name,
        text: room.pricingNotes,
      });
    }
  }

  for (const restaurant of content.restaurants) {
    const info: string[] = [];
    if (restaurant.cuisine) info.push(restaurant.cuisine);
    if (restaurant.hours) info.push(`saatler: ${restaurant.hours}`);
    entries.push({
      id: `restaurant.${slugifyId(restaurant.name)}`,
      kind: "verified",
      hint: `${restaurant.name} restoran`,
      title: restaurant.name,
      text: `Restoran ${restaurant.name}${info.length ? ` — ${info.join(", ")}` : ""}.`,
    });
  }

  for (const extra of content.extras) {
    entries.push({
      id: `extra.${slugifyId(extra.name)}`,
      kind: "verified",
      hint: `${extra.name} ek hizmet`,
      title: extra.name,
      text: `Ek hizmet: ${extra.name}${extra.unitLabel ? ` (${extra.unitLabel})` : ""}.`,
    });
  }

  (profile?.policies ?? []).forEach((text, i) => {
    entries.push({
      id: `policy.manual.${i}`,
      kind: "policy",
      hint: "otel politikası",
      text,
    });
  });

  (profile?.facts ?? []).forEach((text, i) => {
    entries.push({
      id: `statement.${i}`,
      kind: "otel_ifadesi",
      hint: "otel ifadesi sahibi notu",
      text,
    });
  });

  return entries;
}

const FACT_CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map<string, { at: number; data: AiFactCatalogEntry[] }>();

export async function buildFactCatalog(hotelSlug: string): Promise<AiFactCatalogEntry[]> {
  const cached = catalogCache.get(hotelSlug);
  if (cached && Date.now() - cached.at < FACT_CATALOG_TTL_MS) {
    return cached.data;
  }
  const data = await buildFactCatalogUncached(hotelSlug);
  catalogCache.set(hotelSlug, { at: Date.now(), data });
  return data;
}

export function clearFactCatalogCache(hotelSlug?: string): void {
  if (hotelSlug) catalogCache.delete(hotelSlug);
  else catalogCache.clear();
}

export function catalogEntryToCard(entry: AiFactCatalogEntry): AiFactCard {
  return {
    kind: entry.kind,
    label: FACT_KIND_LABELS[entry.kind],
    title: entry.title,
    text: entry.text,
  };
}

export function formatCatalogForPrompt(entries: AiFactCatalogEntry[]): string {
  if (entries.length === 0) return "(Fact kataloğu boş)";
  return entries
    .map((e) => `- ${e.id} [${FACT_KIND_LABELS[e.kind]}]: ${e.hint}`)
    .join("\n");
}

export async function citeFactById(
  hotelSlug: string,
  factId: string,
  catalog?: AiFactCatalogEntry[],
): Promise<AiFactQueryResult> {
  const list = catalog ?? (await buildFactCatalog(hotelSlug));
  const entry = list.find((e) => e.id === factId);
  if (!entry) {
    return { ok: false, error: "Fact bulunamadı." };
  }
  return { ok: true, card: catalogEntryToCard(entry) };
}
