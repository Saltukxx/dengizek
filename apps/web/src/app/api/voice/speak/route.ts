// ---------------------------------------------------------------------------
// POST /api/voice/speak — rehber cevabının bir cümlesini Türkçe seslendirir.
//
// Ses kendi sunucumuzdaki Piper servisinde üretilir (bkz. deploy/piper),
// misafirin sesi ya da metni üçüncü tarafa gitmez. PIPER_URL yoksa veya servis
// yanıt vermezse 503/502 döner; istemci tarayıcının kendi sesine düşer.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { apiFail, apiRateLimited, apiServiceUnavailable, validationMessage } from "@/lib/api-response";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

/** İstemci cümleleri MAX_SPEECH_CHARS'a böler; biraz pay bırakılır. */
const MAX_TEXT_CHARS = 400;
const PIPER_TIMEOUT_MS = 10_000;

const speakSchema = z.object({
  text: z.string().trim().min(1, "Metin boş olamaz.").max(MAX_TEXT_CHARS, "Metin çok uzun."),
});

function isWav(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length > 44 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

export async function POST(req: Request) {
  // Bir cevap ~3–6 cümle; dakikada 40 istek ~8 cevaba yeter.
  if (
    !(await checkRateLimit(requestIp(req), {
      name: "voice-speak",
      windowMs: 60_000,
      limit: 40,
    }))
  ) {
    return apiRateLimited();
  }

  const piperUrl = process.env.PIPER_URL?.trim().replace(/\/+$/, "");
  if (!piperUrl) {
    return apiServiceUnavailable("Sesli yanıt yapılandırılmamış.");
  }

  const body = await req.json().catch(() => null);
  const parsed = speakSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail(validationMessage(parsed.error), 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${piperUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: parsed.data.text }),
      signal: AbortSignal.timeout(PIPER_TIMEOUT_MS),
    });
  } catch {
    return apiFail("Ses servisine ulaşılamadı.", 502);
  }

  // Piper WAV'ı "text/html" başlığıyla gönderir; tür yerine RIFF imzasına bakılır.
  const audio = upstream.ok ? new Uint8Array(await upstream.arrayBuffer().catch(() => new ArrayBuffer(0))) : null;
  if (!audio || !isWav(audio)) {
    return apiFail("Ses üretilemedi.", 502);
  }

  return new Response(audio, {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
