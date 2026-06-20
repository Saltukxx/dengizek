"use client";

/** Client-side analytics — POST to public API */

export async function trackEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  hotelSlug?: string,
) {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload, hotelSlug }),
    });
  } catch {
    // ignore
  }
}
