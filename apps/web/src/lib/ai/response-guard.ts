// ---------------------------------------------------------------------------
// AI yanıt guard — serbest metinde fiyat/rakam engeli
// ---------------------------------------------------------------------------

import type { TextStreamPart, ToolSet } from "ai";

const PRICE_PATTERNS = [
  /₺\s*[\d.,]+/,
  /[\d.,]+\s*₺/,
  /\$\s*[\d.,]+/,
  /[\d.,]+\s*\$/,
  /€\s*[\d.,]+/,
  /[\d.,]+\s*€/,
  /[\d.,]+\s*(TL|tl|TRY|try)\b/,
  /\b[\d.,]+\s*(gece|kişi|kisi)\b/i,
];

export const GUARD_FALLBACK_MESSAGE =
  "Güncel bilgiyi kartta göstermek için lütfen tekrar sorun; size doğru veriyi göstereyim.";

export function textContainsPriceLikeContent(text: string): boolean {
  return PRICE_PATTERNS.some((re) => re.test(text));
}

export function guardAssistantText(
  text: string,
  opts: { hadPriceTool: boolean; hadFactTool: boolean },
): { text: string; triggered: boolean } {
  if (!text.trim()) return { text, triggered: false };
  if (opts.hadPriceTool) return { text, triggered: false };
  if (!textContainsPriceLikeContent(text)) return { text, triggered: false };
  return { text: GUARD_FALLBACK_MESSAGE, triggered: true };
}

const PRICE_KEYWORDS = ["fiyat", "kaç para", "gecelik", "ne kadar", "ücret", "ucret", "tl", "€", "$"];
const FACT_KEYWORDS = [
  "iptal",
  "evcil",
  "check-in",
  "check-out",
  "check in",
  "politika",
  "olanak",
  "restoran",
  "oda fiyat",
  "oda tipi",
  "oda özellik",
  "oda ozellik",
  "kapasite",
  "adres",
  "telefon",
];

export function detectToolHints(userMessage: string): {
  needsPriceTool: boolean;
  needsFactTool: boolean;
} {
  const lower = userMessage.toLowerCase();
  const hasOdaFact =
    /\boda\b/.test(lower) &&
    (lower.includes("politika") ||
      lower.includes("iptal") ||
      lower.includes("özellik") ||
      lower.includes("ozellik") ||
      lower.includes("tipi") ||
      lower.includes("kapasite"));
  return {
    needsPriceTool: PRICE_KEYWORDS.some((kw) => lower.includes(kw)),
    needsFactTool:
      FACT_KEYWORDS.some((kw) => lower.includes(kw)) || hasOdaFact,
  };
}

export function buildToolHintPrompt(hints: { needsPriceTool: boolean; needsFactTool: boolean }): string {
  const parts: string[] = [];
  if (hints.needsPriceTool) parts.push("Bu mesajda MUTLAKA getRoomPrice aracını kullan.");
  if (hints.needsFactTool) parts.push("Bu mesajda MUTLAKA citeFact aracını kullan.");
  return parts.join(" ");
}

type GuardFlags = { hadPriceTool: boolean; hadFactTool: boolean };

/** Stream transform: buffers text per block, replaces with fallback if guard triggers. */
export function createGuardStreamTransform(
  flags: GuardFlags,
  onGuardTriggered?: () => void,
) {
  return () => {
    let accumulated = "";
    let pendingDeltas: Extract<TextStreamPart<ToolSet>, { type: "text-delta" }>[] = [];
    let currentTextId: string | null = null;
    let guardFired = false;

    const flushText = (
      controller: TransformStreamDefaultController<TextStreamPart<ToolSet>>,
      textEndChunk?: Extract<TextStreamPart<ToolSet>, { type: "text-end" }>,
    ) => {
      if (pendingDeltas.length === 0) return;

      const guarded = guardAssistantText(accumulated, flags);
      if (guarded.triggered && !guardFired) {
        guardFired = true;
        onGuardTriggered?.();
        const id = textEndChunk?.id ?? currentTextId ?? pendingDeltas[0]!.id;
        controller.enqueue({ type: "text-delta", id, text: guarded.text });
      } else {
        for (const d of pendingDeltas) controller.enqueue(d);
      }
      pendingDeltas = [];
      accumulated = "";
    };

    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(chunk, controller) {
        if (chunk.type === "text-start") {
          flushText(controller);
          currentTextId = chunk.id;
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type === "text-delta") {
          accumulated += chunk.text;
          pendingDeltas.push(chunk);
          return;
        }
        if (chunk.type === "text-end") {
          flushText(controller, chunk);
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type === "finish-step" || chunk.type === "finish") {
          flushText(controller);
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        flushText(controller);
      },
    });
  };
}
