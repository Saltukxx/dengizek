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
