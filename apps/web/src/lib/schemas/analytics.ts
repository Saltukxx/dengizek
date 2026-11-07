import { z } from "zod";
import { ANALYTICS_EVENT_TYPES, type AnalyticsEventType } from "@/lib/analytics-events";

// Olay listeleri zod'suz modülde: tarayıcı paketine (analytics-client) zod girmesin.
export { ANALYTICS_EVENT_TYPES, JOURNEY_EVENT_TYPES, type AnalyticsEventType } from "@/lib/analytics-events";

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
  tour_exit: "Turdan çıkış",
  hotel_chat_open: "Otel sayfası sohbeti açıldı",
  hotel_contact_click: "Otel iletişim düğmesi (Ara / WhatsApp)",
  inquiry_start: "Talep başlangıcı",
  inquiry_submit: "Talep gönderimi",
  ai_tool_price: "AI fiyat sorgusu",
  ai_tool_fact: "AI bilgi sorgusu",
  ai_guard_triggered: "AI güvenlik tetiklemesi",
  ai_completion_drift: "AI yanıt sapması",
  ai_usage: "AI kullanımı",
};

/**
 * Panel ekranları için tüm etiketler — misafir tarafının gönderemediği, yalnız
 * sunucunun yazdığı olaylar dahil.
 */
export const ALL_EVENT_LABELS: Record<string, string> = {
  ...ANALYTICS_EVENT_LABELS,
  hotel_search: "Arama asistanı",
  ai_unanswered: "Rehberin cevapsız sorusu",
  ai_question: "Rehbere sorulan soru",
  ai_feedback: "Misafir değerlendirmesi",
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

/**
 * Anonim ziyaret kimliği: tarayıcı sekmesi başına rastgele UUID. Biçimi
 * sıkı tutulur ki bu alana kimlik bilgisi (e-posta, isim) yazılamasın.
 */
export const visitIdSchema = z.string().uuid();



export const analyticsTrackSchema = z.object({
  eventType: z.enum(ANALYTICS_EVENT_TYPES),
  hotelSlug: z.string().max(120).optional(),
  visitId: visitIdSchema.optional(),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .refine((p) => JSON.stringify(p).length <= ANALYTICS_MAX_PAYLOAD_BYTES, {
      message: `payload en fazla ${ANALYTICS_MAX_PAYLOAD_BYTES} bayt olabilir`,
    }),
});

export type AnalyticsTrackInput = z.infer<typeof analyticsTrackSchema>;
