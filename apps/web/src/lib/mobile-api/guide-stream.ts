// ---------------------------------------------------------------------------
// iOS rehber akışı: web rehberinin AI SDK "UI message stream" olaylarını
// uygulamanın okuduğu sade olaylara çevirir. AI SDK sürümü değişse de
// uygulamanın gördüğü biçim (MobileGuideEvent) sabit kalır.
// ---------------------------------------------------------------------------

import type { AiFactCard, AiPriceCard } from "@/lib/ai/types";

export type MobileGuideEvent =
  | { type: "text"; delta: string }
  | { type: "fact"; card: AiFactCard }
  | { type: "price"; cards: AiPriceCard[] }
  | { type: "navigate"; stepId: string }
  | { type: "inquiry" }
  | { type: "chips"; chips: string[] }
  | { type: "done" }
  | { type: "error"; message: string };

type Chunk = { type?: string; [key: string]: unknown };

/** Bir akış boyunca araç çağrısı kimliğinden araç adını hatırlar. */
export class GuideStreamMapper {
  private toolNames = new Map<string, string>();

  map(chunk: Chunk): MobileGuideEvent[] {
    switch (chunk.type) {
      case "text-delta":
        return typeof chunk.delta === "string" && chunk.delta ? [{ type: "text", delta: chunk.delta }] : [];
      case "tool-input-available": {
        const id = String(chunk.toolCallId ?? "");
        const name = String(chunk.toolName ?? "");
        this.toolNames.set(id, name);
        const input = (chunk.input ?? {}) as Record<string, unknown>;
        if (name === "navigateTo" && typeof input.stepId === "string") return [{ type: "navigate", stepId: input.stepId }];
        if (name === "suggestNext" && Array.isArray(input.chips)) {
          const chips = input.chips.filter((c): c is string => typeof c === "string").slice(0, 4);
          return chips.length ? [{ type: "chips", chips }] : [];
        }
        return [];
      }
      case "tool-output-available": {
        const name = this.toolNames.get(String(chunk.toolCallId ?? ""));
        const output = (chunk.output ?? {}) as { ok?: boolean; card?: AiFactCard; cards?: AiPriceCard[]; blocked?: boolean };
        if (output.ok === false) return [];
        if (name === "citeFact" && output.card) return [{ type: "fact", card: output.card }];
        if (name === "getRoomPrice" && Array.isArray(output.cards) && output.cards.length) return [{ type: "price", cards: output.cards }];
        if (name === "openInquiry") return [{ type: "inquiry" }];
        return [];
      }
      case "error":
        return [{ type: "error", message: "Rehber şu an cevap veremedi. Lütfen tekrar deneyin." }];
      case "finish":
        return [{ type: "done" }];
      default:
        return [];
    }
  }
}

/** `data: {...}` satırlarından oluşan SSE akışını mobil SSE olaylarına çevirir. */
export function toMobileGuideStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const mapper = new GuideStreamMapper();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let finished = false;

  const emit = (controller: TransformStreamDefaultController<Uint8Array>, event: MobileGuideEvent) => {
    if (event.type === "done" || event.type === "error") finished = true;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const handleLine = (controller: TransformStreamDefaultController<Uint8Array>, line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(payload) as Chunk;
    } catch {
      return;
    }
    for (const event of mapper.map(chunk)) emit(controller, event);
  };

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, controller) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(controller, line);
      },
      flush(controller) {
        if (buffer) handleLine(controller, buffer);
        // Akış "finish" olmadan koptuysa uygulama beklemede kalmasın.
        if (!finished) emit(controller, { type: "error", message: "Bağlantı yarıda kesildi. Lütfen tekrar deneyin." });
      },
    }),
  );
}
