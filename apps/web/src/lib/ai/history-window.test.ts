import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { windowConversationHistory } from "@/lib/ai/history-window";

function userMsg(content: string): ModelMessage {
  return { role: "user", content };
}
function assistantMsg(content: string): ModelMessage {
  return { role: "assistant", content };
}

describe("windowConversationHistory", () => {
  it("pencereden küçük listeleri olduğu gibi döner", () => {
    const messages = [userMsg("a"), assistantMsg("b")];
    expect(windowConversationHistory(messages)).toEqual(messages);
  });

  it("maxMessages aşıldığında yalnızca son N mesajı tutar", () => {
    const messages = Array.from({ length: 20 }, (_, i) => userMsg(`m${i}`));
    const result = windowConversationHistory(messages, { maxMessages: 5 });
    expect(result).toHaveLength(5);
    expect(result.map((m) => m.content)).toEqual(["m15", "m16", "m17", "m18", "m19"]);
  });

  it("[HIDDEN] sentinel mesajlarını pencereye girmeden eler", () => {
    const messages = [
      userMsg("gerçek soru 1"),
      assistantMsg("cevap 1"),
      userMsg("[HIDDEN]"),
      assistantMsg("proaktif cevap"),
      userMsg("[HIDDEN]"),
      assistantMsg("başka proaktif cevap"),
      userMsg("gerçek soru 2"),
    ];
    const result = windowConversationHistory(messages, { maxMessages: 4 });
    expect(result.some((m) => m.content === "[HIDDEN]")).toBe(false);
    expect(result.map((m) => m.content)).toContain("gerçek soru 2");
  });

  it("idle-ağırlıklı uzun oturumda gerçek turları [HIDDEN] mesajları itmez", () => {
    const messages: ModelMessage[] = [userMsg("ilk gerçek soru"), assistantMsg("ilk cevap")];
    for (let i = 0; i < 30; i++) {
      messages.push(userMsg("[HIDDEN]"), assistantMsg(`nudge ${i}`));
    }
    const result = windowConversationHistory(messages, { maxMessages: 6 });
    expect(result.some((m) => m.content === "[HIDDEN]")).toBe(false);
    // İlk gerçek soru pencereden düşmüş olabilir (30+ nudge sonrası çok eski)
    // ama hiçbir [HIDDEN] mesajı pencereyi işgal etmemeli.
    expect(result).toHaveLength(6);
  });

  it("dizi (array) içerikli mesajlarda da [HIDDEN] metnini tanır", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "[HIDDEN]" }] },
      assistantMsg("cevap"),
    ];
    const result = windowConversationHistory(messages);
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("cevap");
  });
});

describe("pencere araç çağrısının ortasından başlamaz", () => {
  // Sunucu kart turu: asistan araç çağrısı + araç sonucu + asistan metni.
  const cardTurn = (n: number): ModelMessage[] => [
    { role: "user", content: `soru ${n}` },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: `c${n}`, toolName: "citeFact", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: `c${n}`, toolName: "citeFact", output: { type: "json", value: {} } }] },
    { role: "assistant", content: `cevap ${n}` },
  ];

  it("kesim bir 'tool' mesajına düşerse sonraki kullanıcı mesajından başlar", () => {
    const history = [1, 2, 3, 4, 5].flatMap(cardTurn); // 20 mesaj
    const windowed = windowConversationHistory(history, { maxMessages: 14 });
    expect(windowed[0]).toEqual({ role: "user", content: "soru 3" });
    expect(windowed.length).toBe(12);
    // Her araç sonucunun çağrısı pencerede.
    windowed.forEach((m, i) => {
      if (m.role === "tool") expect(windowed[i - 1]?.role).toBe("assistant");
    });
  });
});
