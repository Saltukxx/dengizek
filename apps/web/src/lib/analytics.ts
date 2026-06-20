import { randomBytes } from "node:crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";

export type AnalyticsEventType =
  | "tour_view"
  | "step_view"
  | "inquiry_start"
  | "inquiry_submit"
  | "ai_message"
  | string;

export async function trackEvent(
  eventType: AnalyticsEventType,
  payload: Record<string, unknown> = {},
  hotelId?: string | null,
  hotelSlug?: string | null,
) {
  if (!isDbConfigured()) return;
  try {
    const db = getDb();
    await db.insert(analyticsEventsTable).values({
      hotelId: hotelId ?? null,
      hotelSlug: hotelSlug ?? null,
      eventType,
      payload,
    });
  } catch {
    // telemetry must not break UX
  }
}

export function generateAccessToken() {
  return randomBytes(24).toString("hex");
}
