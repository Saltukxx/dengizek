// ---------------------------------------------------------------------------
// POST /api/v1/guide/chat — iOS uygulaması AI rehberi.
//
// Web rehberiyle aynı işleyici (/api/tour/chat): aynı hız sınırları, kart
// koruması, soru kaydı. Burada yalnız istek sadeleştirilir ve yanıt
// akışı uygulamanın okuduğu sade SSE olaylarına çevrilir (guide-stream.ts).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { POST as webChat } from "@/app/api/tour/chat/chat-handler";
import { apiFail, validationMessage } from "@/lib/api-response";
import { HOTEL_PAGE_STEP_ID, HOTEL_PAGE_TOUR_ID } from "@/lib/ai/hotel-page-chat";
import { toMobileGuideStream } from "@/lib/mobile-api/guide-stream";

export const maxDuration = 60;

const bodySchema = z.object({
  hotelSlug: z.string().min(1).max(120),
  /** Boşsa otel sayfası sohbeti (tur yok). */
  tourId: z.string().min(1).max(120).optional(),
  currentStepId: z.string().min(1).max(120).optional(),
  stepsSeen: z.array(z.string().max(120)).max(200).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
  /** Uygulamanın ürettiği cihaz kimliği (UUID) — soru kaydını aynı ziyarete bağlar. */
  deviceId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiFail(validationMessage(parsed.error), 400);
  const body = parsed.data;
  if (body.messages[body.messages.length - 1]?.role !== "user") {
    return apiFail("Son mesaj misafirden olmalı.", 400);
  }

  const onTour = Boolean(body.tourId);
  const chatRequest = {
    hotelSlug: body.hotelSlug,
    tourId: body.tourId ?? HOTEL_PAGE_TOUR_ID,
    currentStepId: onTour ? (body.currentStepId ?? HOTEL_PAGE_STEP_ID) : HOTEL_PAGE_STEP_ID,
    stepsSeen: body.stepsSeen ?? [],
    triggerReason: "userMessage" as const,
    isAutoTour: false,
    visitId: body.deviceId,
    messages: body.messages.map((m) => ({ role: m.role, parts: [{ type: "text", text: m.text }] })),
  };

  // İstemci IP'si başlıklarda kalır; gövde değiştiği için uzunluk başlığı atılır.
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  const response = await webChat(new Request(req.url, { method: "POST", headers, body: JSON.stringify(chatRequest) }));

  const isStream = response.headers.get("content-type")?.includes("text/event-stream");
  if (!response.ok || !isStream || !response.body) {
    const failure = (await response.json().catch(() => null)) as { error?: string } | null;
    return apiFail(failure?.error ?? "Rehber şu an cevap veremedi.", response.ok ? 502 : response.status);
  }

  return new Response(toMobileGuideStream(response.body), {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" },
  });
}
