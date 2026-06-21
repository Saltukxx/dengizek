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
  "inquiry_start",
  "inquiry_submit",
  "room_view",
  "hotel_view",
] as const;

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
