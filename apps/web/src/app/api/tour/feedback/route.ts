// ---------------------------------------------------------------------------
// POST /api/tour/feedback — misafirin rehber cevabına 👍/👎 değerlendirmesi.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { apiNotFound, apiRateLimited } from "@/lib/api-response";
import { FEEDBACK_EVENT, feedbackPayload } from "@/lib/ai/feedback";
import { getHotelIdBySlug } from "@/lib/hotels-repo";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  hotelSlug: z.string().min(1).max(120),
  tourId: z.string().min(1).max(100),
  messageId: z.string().min(1).max(100),
  rating: z.enum(["up", "down"]),
  question: z.string().max(1000).default(""),
  answer: z.string().max(4000).default(""),
});

export async function POST(req: Request) {
  if (!(await checkRateLimit(requestIp(req), { name: "tour-feedback", windowMs: 60_000, limit: 30 }))) {
    return apiRateLimited();
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Geçersiz istek" }, { status: 400 });

  const { hotelSlug, ...input } = parsed.data;
  const hotelId = await getHotelIdBySlug(hotelSlug);
  if (!hotelId) return apiNotFound("Tesis bulunamadı.");

  await trackEvent(FEEDBACK_EVENT, { ...feedbackPayload(input) }, hotelId, hotelSlug);
  return NextResponse.json({ ok: true });
}
