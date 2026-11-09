// ---------------------------------------------------------------------------
// Vitrin banner sahnesi için gerçek soru-cevap örneği.
//
// Sahnedeki cevap uydurulmaz: yayındaki bir otelin bilgisinden, rehberin
// kullandığı aynı sunucu planlayıcısıyla (embedding'siz, model çağrısı yok)
// seçilir. Sorular yüzeyin ayarındadır ve sahnenin ilk durağıyla (videosuyla)
// eşleşir; cevap o konuyu taşımıyorsa kullanılmaz.
// ---------------------------------------------------------------------------

import { buildFactCatalog, catalogEntryToCard } from "@/lib/ai/fact-store";
import { planServerTools } from "@/lib/ai/deterministic-tools";
import { cardAnswerSentence, detectToolHints } from "@/lib/ai/response-guard";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { guestCached, GUEST_HOTEL_LIST_TAG } from "@/lib/guest-cache";
import type { GuestSurface } from "@/lib/guest-surface";
import { getPublishedHotelContent, type BrowseHotelRow } from "@/lib/hotels-repo";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";

export interface ShowcaseDemoDialog {
  hotelSlug: string;
  hotelName: string;
  question: string;
  /** Kartın soruya uyan cümlesi — rehberin sahnedeki cevabı. */
  answer: string;
  /** "Doğrulanmış bilgi" | "Otel ifadesi" … */
  cardLabel: string;
  cardTitle?: string;
}

/** Taranacak en fazla otel — sayfa render'ı onlarca katalog kurmasın. */
const MAX_HOTELS = 12;
/** Sahne balonuna sığacak cevap uzunluğu. */
const MAX_ANSWER_CHARS = 140;

type DemoHotel = Pick<BrowseHotelRow, "slug" | "name" | "tourId">;

async function findDemo(surface: GuestSurface, hotels: DemoHotel[]): Promise<ShowcaseDemoDialog | null> {
  // Turu olan otel önce: sahne "video tur + rehber" anlatıyor.
  const ordered = [...hotels.filter((h) => h.tourId), ...hotels.filter((h) => !h.tourId)].slice(0, MAX_HOTELS);
  for (const { question, accept } of SHOWCASE_CONFIGS[surface].demoQuestions) {
    for (const hotel of ordered) {
      try {
        const [profile, content] = await Promise.all([
          getHotelAiProfile(hotel.slug),
          getPublishedHotelContent(hotel.slug),
        ]);
        const catalog = await buildFactCatalog(hotel.slug, { profile, content });
        const plan = await planServerTools({
          message: question,
          messageEmbedding: null,
          hints: detectToolHints(question),
          inquiryIntent: "none",
          catalog,
          rooms: [],
          today: new Date().toISOString().slice(0, 10),
        });
        const call = plan.calls.length === 1 && plan.calls[0]!.toolName === "citeFact" ? plan.calls[0] : undefined;
        const entry = call && catalog.find((e) => e.id === (call.input as { factId: string }).factId);
        if (!entry) continue;
        const answer = cardAnswerSentence({ title: entry.title, text: entry.text }, question).trim();
        if (!answer || answer.length > MAX_ANSWER_CHARS || !accept.every((re) => re.test(answer))) continue;
        const card = catalogEntryToCard(entry);
        return {
          hotelSlug: hotel.slug,
          hotelName: hotel.name,
          question,
          answer: /[.!?…]$/.test(answer) ? answer : `${answer}.`,
          cardLabel: card.label,
          cardTitle: card.title,
        };
      } catch {
        // Tek otelin verisi okunamazsa sıradakine geçilir.
      }
    }
  }
  return null;
}

const cachedDemo = guestCached(
  "showcase-demo",
  (surface: GuestSurface, hotels: DemoHotel[]) => findDemo(surface, hotels),
  () => [GUEST_HOTEL_LIST_TAG],
);

/** Yüzeyin yayındaki otellerinden sahne diyaloğu; uygun bilgi yoksa null. */
export function getShowcaseDemoDialog(surface: GuestSurface, hotels: BrowseHotelRow[]): Promise<ShowcaseDemoDialog | null> {
  return cachedDemo(surface, hotels.map((h) => ({ slug: h.slug, name: h.name, tourId: h.tourId })));
}
