// ---------------------------------------------------------------------------
// Arama asistanı — kuralların anlayamadığı cümleyi modelle yorumlama.
//
// Model YALNIZ cümleyi bizim bildiğimiz filtrelere çevirir ("çocuklarla
// gidilecek sakin bir yer" → çocuk dostu). Seçenekler sabit listelerdir
// (olanaklar, yerler, kavramlar); model otel hakkında hiçbir şey söylemez,
// sonuçlar yine otellerin verisinden gelir. Desteklenmeyen istekleri
// ("deniz manzarası") ayrıca döndürür; misafire "anlayamadım" denir.
//
// Model yalnız kurallar başarısız olduğunda çağrılır; sonuç önbelleğe alınır.
// Hata, zaman aşımı ya da model yoksa kural sonucu kullanılır.
// ---------------------------------------------------------------------------

import { Output, generateText } from "ai";
import { z } from "zod";
import { CHAT_PROVIDER_OPTIONS, getChatModel } from "@/lib/ai/llm";
import { searchHotels, type ConceptKey, type ParsedSearch, type SearchIndexHotel, type SearchResponse } from "@/lib/ai/hotel-search";
import { canonicalAmenityText } from "@/lib/ai/amenity-match";
import { groupingKey, normalizeText } from "@/lib/ai/text";

/** Modelin seçebileceği olanaklar (misafirin göreceği yazım). */
export const AMENITY_OPTIONS = [
  "çocuk havuzu", "kapalı havuz", "açık havuz", "termal havuz", "havuz", "kaydıraklı havuz", "aquapark", "fitness",
  "hamam", "sauna", "buhar odası", "masaj", "spa", "jakuzi", "otopark", "internet", "asansör", "klima", "restoran",
  "çocuk kulübü", "oyun alanı", "animasyon", "toplantı salonu", "tenis", "masa tenisi", "bilardo", "golf", "plaj",
  "havalimanı servisi", "oda servisi", "minibar", "balkon", "kuaför", "doktor", "çamaşırhane", "denize sıfır",
] as const;

const CONCEPT_OPTIONS = ["cocuk-dostu", "balayi", "spa-kur"] as const satisfies readonly ConceptKey[];
const BOARD_OPTIONS = ["kahvalti-dahil", "yarim-pansiyon", "tam-pansiyon", "hersey-dahil"] as const;

function interpretationSchema(places: string[]) {
  return z.object({
    amenities: z.array(z.enum(AMENITY_OPTIONS)).describe("Açıkça istenen olanaklar"),
    places: z.array(places.length ? z.enum(places as [string, ...string[]]) : z.string()).describe("İstenen şehir/ilçe (yalnız listeden)"),
    concepts: z.array(z.enum(CONCEPT_OPTIONS)).describe("cocuk-dostu: çocuklu aile; balayi: balayı/romantik; spa-kur: şifa, kür, wellness"),
    pets: z.boolean().describe("Evcil hayvan kabul eden otel isteniyor mu"),
    guests: z.number().int().min(1).max(12).nullable().describe("Odada kalacak toplam kişi"),
    board: z.enum(BOARD_OPTIONS).nullable(),
    nearAirport: z.boolean(),
    minStars: z.number().int().min(1).max(5).nullable(),
    unsupported: z.array(z.string()).describe("Listelerle ifade edilemeyen istekler, misafirin kelimeleriyle (ör. 'deniz manzarası', 'sakin')"),
  });
}

export type Interpretation = z.infer<ReturnType<typeof interpretationSchema>>;
export type Interpreter = (query: string, places: string[]) => Promise<Interpretation | null>;

/** Misafir sayfada bekliyor: ilk (soğuk) çağrı 4 sn'yi aşabildi, sonrası ~1-2 sn. */
const TIMEOUT_MS = 7_000;
const CACHE_LIMIT = 1_000;
const cache = new Map<string, Interpretation | null>();

/** Gemini ile yorum. Model yoksa, hata ya da zaman aşımında null. */
export const interpretWithModel: Interpreter = async (query, places) => {
  const model = getChatModel();
  if (!model) return null;
  const key = groupingKey(query);
  if (cache.has(key)) return cache.get(key)!;
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: interpretationSchema(places) }),
      system: [
        "Bir otel arama motoru için misafirin cümlesini filtrelere çevir. YALNIZ verilen seçenekleri kullan.",
        "Eş anlamlıları ve günlük dili seçeneklere eşle: 'terleme odası' → sauna, 'spor yapacak yer' → fitness, " +
          "'ufaklıklar/çocuklar' → cocuk-dostu, 'eşimle baş başa' → balayi, 'kaplıca kürü' → spa-kur, " +
          "'Kapadokya' → Nevşehir, 'Pamukkale' → Denizli.",
        "Cümlede olmayan bir istek ekleme. Kişi sayısını yalnız açıkça söylendiyse yaz.",
        "'unsupported' alanına YALNIZ hiçbir seçenekle ifade edilemeyen istekleri yaz (ör. 'deniz manzarası', 'sakin'); " +
          "bir seçeneğe eşlediğin kelimeleri oraya yazma.",
        "Otel önerme, açıklama yazma.",
      ].join(" "),
      prompt: `Misafirin cümlesi: "${query}"`,
      temperature: 0,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: CHAT_PROVIDER_OPTIONS,
    });
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, output);
    return output;
  } catch (err) {
    console.warn("[search-interpret] model yorumu başarısız, kural sonucu kullanılıyor:", err instanceof Error ? err.message : err);
    return null;
  }
};

/** Kurallar yeterli mi? Hiçbir şey anlaşılmadıysa ya da anlaşılmayan kelime varsa modele sorulur. */
export function needsInterpretation(response: SearchResponse): boolean {
  return response.query.unknown.length > 0;
}

/** Model yorumunu kural sonucunun boşluklarına ekler (kurallar önceliklidir). */
export function applyInterpretation(parsed: ParsedSearch, interpretation: Interpretation): ParsedSearch {
  const amenities = [...parsed.amenities];
  for (const option of interpretation.amenities) {
    const phrase = canonicalAmenityText(option);
    if (!amenities.some((a) => a.phrase === phrase)) amenities.push({ phrase, label: option });
  }
  return {
    ...parsed,
    amenities,
    places: parsed.places.length ? parsed.places : interpretation.places.map((p) => normalizeText(p)),
    concepts: [...new Set([...parsed.concepts, ...interpretation.concepts])],
    pets: parsed.pets || interpretation.pets,
    guests: parsed.guests ?? interpretation.guests,
    board: parsed.board ?? interpretation.board,
    nearAirport: parsed.nearAirport || interpretation.nearAirport,
    minStars: parsed.minStars ?? interpretation.minStars,
    unknown: interpretation.unsupported.map((u) => u.trim().toLocaleLowerCase("tr-TR")).filter(Boolean),
  };
}

/**
 * Önce kurallar; anlaşılmayan kelime kalırsa model yorumu eklenip arama
 * yeniden yapılır. Model sonucu değiştirmediyse ya da başarısızsa kural
 * sonucu döner.
 */
export async function searchHotelsSmart(
  query: string,
  index: SearchIndexHotel[],
  context: string[] = [],
  interpret: Interpreter = interpretWithModel,
): Promise<SearchResponse & { interpretedByModel: boolean }> {
  const ruled = searchHotels(query, index, context);
  if (!needsInterpretation(ruled)) return { ...ruled, interpretedByModel: false };
  const places = [...new Set(index.map((h) => h.city).filter((c): c is string => Boolean(c)))];
  const interpretation = await interpret(query, places);
  if (!interpretation) return { ...ruled, interpretedByModel: false };
  const merged = applyInterpretation(ruled.query, interpretation);
  const response = searchHotels(query, index, context, merged);
  return { ...response, interpretedByModel: true };
}
