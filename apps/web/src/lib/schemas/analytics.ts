import { z } from "zod";

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "tour_start",
  "tour_step",
  "tour_auto_start",
  "tour_auto_end",
  "tour_complete",
  "tour_step_view",
  "ai_tool_price",
  "ai_tool_fact",
  "ai_guard_triggered",
  "ai_completion_drift",
  "ai_usage",
  "inquiry_start",
  "inquiry_submit",
  "room_view",
  "hotel_view",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * Panel/admin ekranlarında gösterilen Türkçe etiketler.
 *
 * Tek kaynak: üretici (misafir yüzeyi) ile tüketici (analitik ekranları) aynı
 * listeden beslenir. Daha önce ekranlar hiç yayımlanmayan "tour_view",
 * "step_view", "ai_message" adlarını bekliyordu; huni ve etiketler bu yüzden
 * boş kalıyordu.
 */
export const ANALYTICS_EVENT_LABELS: Record<AnalyticsEventType, string> = {
  page_view: "Sayfa görüntüleme",
  hotel_view: "Otel sayfası görüntüleme",
  room_view: "Oda görüntüleme",
  tour_start: "Tur başlatma",
  tour_step: "Tur adımı",
  tour_step_view: "Adım görüntüleme",
  tour_auto_start: "Otomatik tur başlatma",
  tour_auto_end: "Otomatik tur bitişi",
  tour_complete: "Tur tamamlama",
  inquiry_start: "Talep başlangıcı",
  inquiry_submit: "Talep gönderimi",
  ai_tool_price: "AI fiyat sorgusu",
  ai_tool_fact: "AI bilgi sorgusu",
  ai_guard_triggered: "AI güvenlik tetiklemesi",
  ai_completion_drift: "AI yanıt sapması",
  ai_usage: "AI kullanımı",
};

/** Ziyaretçi hunisi — dönüşüm oranı bu adımlar üzerinden hesaplanır. */
export function analyticsFunnel(byType: Record<string, number>) {
  const hotelViews = byType.hotel_view ?? 0;
  const tourStarts = byType.tour_start ?? 0;
  const inquiryStarts = byType.inquiry_start ?? 0;
  const inquirySubmits = byType.inquiry_submit ?? 0;
  // Otel görüntülemesi yoksa (ör. yalnızca tur bağlantısı paylaşılmışsa)
  // huni tabanı tur başlatmaya düşer.
  const base = hotelViews > 0 ? hotelViews : tourStarts;
  return {
    hotelViews,
    tourStarts,
    inquiryStarts,
    inquirySubmits,
    conversionRate: base > 0 ? Math.round((inquirySubmits / base) * 1000) / 10 : null,
  };
}

/** JSON serileştirilmiş payload üst sınırı (bayt). */
export const ANALYTICS_MAX_PAYLOAD_BYTES = 4096;

export const analyticsTrackSchema = z.object({
  eventType: z.enum(ANALYTICS_EVENT_TYPES),
  hotelSlug: z.string().max(120).optional(),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .refine((p) => JSON.stringify(p).length <= ANALYTICS_MAX_PAYLOAD_BYTES, {
      message: `payload en fazla ${ANALYTICS_MAX_PAYLOAD_BYTES} bayt olabilir`,
    }),
});

export type AnalyticsTrackInput = z.infer<typeof analyticsTrackSchema>;
