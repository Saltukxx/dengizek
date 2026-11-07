// ---------------------------------------------------------------------------
// Analitik olay türleri — zod içermez. Tarayıcıda çalışan analytics-client bu
// listeleri buradan alır; doğrulama şeması (@/lib/schemas/analytics) sunucuda.
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "tour_start",
  "tour_step",
  "tour_auto_start",
  "tour_auto_end",
  "tour_complete",
  "tour_step_view",
  "tour_exit",
  "hotel_chat_open",
  "hotel_contact_click",
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
 * Yolculuk analizi için gerekli olaylar — ziyaretçi analitik onayı vermese
 * de gönderilir (ürün kararı: soru → tur → talep zinciri herkeste izlenir).
 * Diğer olaylar onay kapısının arkasında kalır.
 */
export const JOURNEY_EVENT_TYPES: readonly AnalyticsEventType[] = [
  "tour_start",
  "tour_step_view",
  "tour_exit",
  "tour_complete",
  "hotel_view",
  "hotel_chat_open",
  "inquiry_start",
];
