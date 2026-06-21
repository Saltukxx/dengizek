import { describe, expect, it } from "vitest";
import {
  GUARD_FALLBACK_MESSAGE,
  buildToolHintPrompt,
  detectToolHints,
  guardAssistantText,
  textContainsPriceLikeContent,
} from "@/lib/ai/response-guard";

describe("textContainsPriceLikeContent", () => {
  it("₺ ve TL patternlerini yakalar", () => {
    expect(textContainsPriceLikeContent("Gecelik 4500 ₺")).toBe(true);
    expect(textContainsPriceLikeContent("4500 TL")).toBe(true);
    expect(textContainsPriceLikeContent("Merhaba, hoş geldiniz.")).toBe(false);
  });
});

describe("guardAssistantText", () => {
  it("tool yokken fiyatlı metni bloklar", () => {
    const result = guardAssistantText("Gecelik 4500 ₺", {
      hadPriceTool: false,
      hadFactTool: false,
    });
    expect(result.triggered).toBe(true);
    expect(result.text).toBe(GUARD_FALLBACK_MESSAGE);
  });

  it("getRoomPrice sonrası metne dokunmaz", () => {
    const original = "İşte fiyat bilgisi.";
    const result = guardAssistantText(original, {
      hadPriceTool: true,
      hadFactTool: false,
    });
    expect(result.triggered).toBe(false);
    expect(result.text).toBe(original);
  });

  it("citeFact sonrası fiyatlı metin yine bloklanır", () => {
    const result = guardAssistantText("Gecelik 4500 ₺", {
      hadPriceTool: false,
      hadFactTool: true,
    });
    expect(result.triggered).toBe(true);
    expect(result.text).toBe(GUARD_FALLBACK_MESSAGE);
  });
});

describe("detectToolHints", () => {
  it("fiyat ve fact ipuçları üretir", () => {
    const hints = detectToolHints("Gecelik fiyat ve iptal politikası nedir?");
    expect(hints.needsPriceTool).toBe(true);
    expect(hints.needsFactTool).toBe(true);
    expect(buildToolHintPrompt(hints)).toContain("getRoomPrice");
    expect(buildToolHintPrompt(hints)).toContain("citeFact");
  });
});
