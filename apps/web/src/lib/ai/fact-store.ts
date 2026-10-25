// ---------------------------------------------------------------------------
// AI fact kataloğu — doğrulanmış bilgi + otel ifadesi etiketleri
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import { createHash } from "node:crypto";
import { amenityLabel } from "@/lib/amenities-catalog";
import { embedText } from "@/lib/ai/embeddings";
import { isLlmConfigured } from "@/lib/ai/llm";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";
import type { AiFactCard, AiFactCatalogEntry, AiFactQueryResult } from "@/lib/ai/types";
import { FACT_KIND_LABELS } from "@/lib/ai/types";
import { chunkFactText } from "@/lib/ai/fact-chunks";

function slugifyId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

export interface FactCatalogSources {
  profile: Awaited<ReturnType<typeof getHotelAiProfile>>;
  content: Awaited<ReturnType<typeof getPublishedHotelContent>>;
}

/** Otel için fact kataloğunu oluşturur (fiyat satırları hariç — fiyat getRoomPrice ile). */
async function buildFactCatalogUncached(
  hotelSlug: string,
  preloaded?: FactCatalogSources,
): Promise<AiFactCatalogEntry[]> {
  const [profile, content] = preloaded
    ? [preloaded.profile, preloaded.content]
    : await Promise.all([
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
  if (specs.totalRooms != null) {
    entries.push({
      id: "spec.total_rooms",
      kind: "verified",
      hint: "toplam oda sayısı kaç oda",
      text: `Tesiste toplam ${specs.totalRooms} oda bulunur.`,
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
    // Tüm olanaklar: kartta olmayan bir olanak için rehber "bilgim yok" der.
    const labels = content.amenities.slice(0, 120).map(amenityLabel);
    entries.push({
      id: "spec.amenities",
      kind: "verified",
      hint: "otel olanakları tesis imkanları",
      text: `Otel olanakları: ${labels.join(", ")}.`,
      items: labels,
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
  // Tesis telefonu bilgi kataloğuna girmez: rehber iletişim bilgisi vermez.

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

  // Uzun metinler parçalara bölünür (bkz. fact-chunks): her parça ayrı
  // aranır, kartta yalnız o görünür. Kısa metnin kimliği değişmez.
  const pushChunked = (baseId: string, kind: AiFactCatalogEntry["kind"], hint: string, text: string) => {
    const { title, chunks } = chunkFactText(text);
    if (chunks.length === 1 && !title) {
      entries.push({ id: baseId, kind, hint, text: chunks[0]! });
      return;
    }
    chunks.forEach((chunk, k) => {
      entries.push({ id: `${baseId}.${k}`, kind, hint: title ? `${hint}: ${title}` : hint, ...(title ? { title } : {}), text: chunk });
    });
  };

  (profile?.policies ?? []).forEach((text, i) => pushChunked(`policy.manual.${i}`, "policy", "otel politikası", text));
  (profile?.facts ?? []).forEach((text, i) => pushChunked(`statement.${i}`, "otel_ifadesi", "otel ifadesi sahibi notu", text));

  // Tesisin serbest metinleri rehbere iletişim bilgisi taşıyamaz.
  return entries.map((entry) => ({ ...entry, text: redactContactInfo(entry.text) }));
}

// Kasıtlı mimari karar (plan Faz 2.4): in-memory Map cache korunur, DB-backed
// bir cache tablosuna GEÇİLMEZ. clearFactCatalogCache yalnızca onaylayan
// serverless örneğinde etkilidir — diğer örnekler yeni içeriği ancak TTL
// dolunca görür. Bu yüzden TTL kısa tutulur (60s): yayın sonrası bayatlık
// üst sınırı 1 dakika, sıcak trafikte yine de DB round-trip'lerinin çoğu
// kırpılır. Doğruluk cache durumundan bağımsızdır (kaynaklar her zaman
// publishedSnapshot'tan okur) — cache yalnızca performans optimizasyonu.
const FACT_CATALOG_TTL_MS = 60 * 1000;
const MAX_CATALOG_CACHE_ENTRIES = 500;
const catalogCache = new Map<string, { at: number; data: AiFactCatalogEntry[] }>();

export async function buildFactCatalog(
  hotelSlug: string,
  preloaded?: FactCatalogSources,
): Promise<AiFactCatalogEntry[]> {
  const cached = catalogCache.get(hotelSlug);
  if (cached && Date.now() - cached.at < FACT_CATALOG_TTL_MS) {
    return cached.data;
  }
  const data = await buildFactCatalogUncached(hotelSlug, preloaded);
  if (catalogCache.size >= MAX_CATALOG_CACHE_ENTRIES) {
    const oldest = catalogCache.keys().next().value;
    if (oldest) catalogCache.delete(oldest);
  }
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

function hashFactContent(entry: AiFactCatalogEntry): string {
  return createHash("sha256").update(`${entry.hint} ${entry.text}`).digest("hex");
}

/** Bir fact'in embed edilen metni — DB'deki embedding'ler ve sunucu tarafı seçim aynı metni kullanır. */
export function factEmbeddingText(entry: AiFactCatalogEntry): string {
  return `${entry.hint}. ${entry.text}`;
}

/**
 * Yayın sırasında kaydedilmiş fact embedding'lerini okur (yalnız içeriği
 * değişmemiş olanlar). Sohbet turu bunları kullanır; katalog her istekte
 * yeniden embed edilmez. DB yoksa veya hata olursa boş harita döner.
 */
export async function loadFactEmbeddings(
  hotelSlug: string,
  catalog: AiFactCatalogEntry[],
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (!process.env.DATABASE_URL || !catalog.length) return result;
  try {
    const { getDb } = await import("@/lib/db");
    const { hotelFactEmbeddingsTable } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await getDb()
      .select({
        factId: hotelFactEmbeddingsTable.factId,
        contentHash: hotelFactEmbeddingsTable.contentHash,
        embedding: hotelFactEmbeddingsTable.embedding,
      })
      .from(hotelFactEmbeddingsTable)
      .where(eq(hotelFactEmbeddingsTable.hotelSlug, hotelSlug));
    const byId = new Map(catalog.map((e) => [e.id, e]));
    for (const row of rows) {
      const entry = byId.get(row.factId);
      if (entry && row.contentHash === hashFactContent(entry)) result.set(row.factId, row.embedding);
    }
  } catch (err) {
    console.warn("[fact-store] loadFactEmbeddings başarısız:", err);
  }
  return result;
}

export type FactEmbeddingFreshness = {
  /** Yayındaki katalogdaki toplam fact sayısı */
  totalFacts: number;
  /** contentHash'i güncel embedding'i olan fact sayısı */
  embedded: number;
  /** Embedding'i hiç olmayan veya hash'i bayat olan fact sayısı */
  missingOrStale: number;
  /** Katalogda artık olmayan (silinmesi gereken) embedding sayısı */
  orphaned: number;
};

/**
 * Yayındaki fact kataloğu ile hotel_fact_embeddings tablosunu karşılaştırıp
 * tazelik özeti döner. RAG'in lexical fallback'e düşüp düşmediğini panelde
 * görünür kılmak için kullanılır (ai-metrics). DB yoksa null döner.
 */
export async function computeFactEmbeddingFreshness(
  hotelSlug: string,
): Promise<FactEmbeddingFreshness | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const { getDb } = await import("@/lib/db");
    const { hotelFactEmbeddingsTable } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const [catalog, existing] = await Promise.all([
      buildFactCatalog(hotelSlug),
      db
        .select({
          factId: hotelFactEmbeddingsTable.factId,
          contentHash: hotelFactEmbeddingsTable.contentHash,
        })
        .from(hotelFactEmbeddingsTable)
        .where(eq(hotelFactEmbeddingsTable.hotelSlug, hotelSlug)),
    ]);

    const existingHashByFactId = new Map(existing.map((r) => [r.factId, r.contentHash]));
    const currentFactIds = new Set(catalog.map((e) => e.id));

    let embedded = 0;
    for (const entry of catalog) {
      if (existingHashByFactId.get(entry.id) === hashFactContent(entry)) embedded += 1;
    }

    return {
      totalFacts: catalog.length,
      embedded,
      missingOrStale: catalog.length - embedded,
      orphaned: existing.filter((r) => !currentFactIds.has(r.factId)).length,
    };
  } catch (err) {
    console.warn("[fact-store] computeFactEmbeddingFreshness başarısız:", err);
    return null;
  }
}

/**
 * Fact kataloğunun embedding'lerini publish-zamanlı senkronize eder (bkz.
 * plan Faz 3.1) — admin onay rotasından çağrılır, chat isteği sırasında
 * ÇAĞRILMAZ (per-turn gecikmeyi etkilemesin diye). Yalnızca contentHash'i
 * değişen fact'ler yeniden embed edilir; kataloqdan düşen fact'lerin
 * embedding'leri silinir. DB veya GEMINI_API_KEY yoksa sessizce çıkar —
 * yayına alma akışını asla kırmaz.
 */
export async function syncFactEmbeddings(hotelSlug: string): Promise<void> {
  if (!process.env.DATABASE_URL || !isLlmConfigured()) return;

  try {
    const { getDb } = await import("@/lib/db");
    const { hotelFactEmbeddingsTable } = await import("@/lib/db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");
    const db = getDb();

    const catalog = await buildFactCatalogUncached(hotelSlug);
    const existing = await db
      .select({
        factId: hotelFactEmbeddingsTable.factId,
        contentHash: hotelFactEmbeddingsTable.contentHash,
      })
      .from(hotelFactEmbeddingsTable)
      .where(eq(hotelFactEmbeddingsTable.hotelSlug, hotelSlug));
    const existingHashByFactId = new Map(existing.map((r) => [r.factId, r.contentHash]));

    for (const entry of catalog) {
      const contentHash = hashFactContent(entry);
      if (existingHashByFactId.get(entry.id) === contentHash) continue;

      const embedding = await embedText(factEmbeddingText(entry));
      if (!embedding) continue; // embed API başarısız — bu fact'i atla, diğerlerine devam et

      await db
        .insert(hotelFactEmbeddingsTable)
        .values({ hotelSlug, factId: entry.id, contentHash, embedding })
        .onConflictDoUpdate({
          target: [hotelFactEmbeddingsTable.hotelSlug, hotelFactEmbeddingsTable.factId],
          set: { contentHash, embedding },
        });
    }

    const currentFactIds = new Set(catalog.map((e) => e.id));
    const staleFactIds = existing.map((r) => r.factId).filter((id) => !currentFactIds.has(id));
    if (staleFactIds.length > 0) {
      await db
        .delete(hotelFactEmbeddingsTable)
        .where(
          and(
            eq(hotelFactEmbeddingsTable.hotelSlug, hotelSlug),
            inArray(hotelFactEmbeddingsTable.factId, staleFactIds),
          ),
        );
    }
  } catch (err) {
    console.warn("[fact-store] syncFactEmbeddings başarısız:", err);
  }
}
