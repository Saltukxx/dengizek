import { beforeEach, describe, expect, it, vi } from "vitest";

const embedTextMock = vi.fn();
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
  // Basit dot-product benzeri bir sahte benzerlik: aynı vektör -> yüksek skor.
  cosineSimilarity: (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0),
}));

import {
  canOpenInquiry,
  computeCompletionState,
  getStepEndTriggerReason,
  hasInquiryIntent,
  hasInquiryIntentSemantic,
  shouldAllowOpenInquiry,
  shouldAllowOpenInquiryAsync,
} from "@/lib/ai/completion-engine";

const steps = [
  { stepId: "s1", title: "Lobi" },
  { stepId: "s2", title: "Havuz" },
  { stepId: "s3", title: "Oda" },
  { stepId: "s4", title: "Spa" },
  { stepId: "s5", title: "Restoran" },
];

describe("computeCompletionState", () => {
  it("sıradaki görülmemiş adımı döner", () => {
    const state = computeCompletionState(steps, ["s1"], "s1");
    expect(state.nextStepId).toBe("s2");
    expect(state.seenCount).toBe(1);
    expect(state.totalCount).toBe(5);
    expect(state.progressRatio).toBe(0.2);
    expect(state.isComplete).toBe(false);
  });

  it("tüm adımlar görüldüğünde isComplete true", () => {
    const state = computeCompletionState(steps, ["s1", "s2", "s3", "s4", "s5"]);
    expect(state.isComplete).toBe(true);
    expect(state.nextStepId).toBeNull();
    expect(state.progressRatio).toBe(1);
  });

  it("remainingStepIds doğru listelenir", () => {
    const state = computeCompletionState(steps, ["s1", "s3"]);
    expect(state.remainingStepIds).toEqual(["s2", "s4", "s5"]);
  });
});

describe("openInquiry gate", () => {
  it("%80 eşiğinde izin verir", () => {
    expect(canOpenInquiry(0.79)).toBe(false);
    expect(canOpenInquiry(0.8)).toBe(true);
  });

  it("rezervasyon niyeti ile erken izin verir", () => {
    expect(hasInquiryIntent("Rezervasyon yapmak istiyorum")).toBe(true);
    expect(shouldAllowOpenInquiry(0.1, "fiyat teklifi alabilir miyim")).toBe(true);
    expect(shouldAllowOpenInquiry(0.1, "havuz nerede")).toBe(false);
  });

  it("book/reserve kelime sınırıyla eşleşir, talep/rezervasyon da yakalanır", () => {
    expect(hasInquiryIntent("I want to book a room")).toBe(true);
    expect(hasInquiryIntent("Can you reserve a table?")).toBe(true);
    expect(hasInquiryIntent("bir talep oluşturur musunuz")).toBe(true);
    expect(hasInquiryIntent("rezervasyon yapabilir miyim")).toBe(true);
  });

  it("alakasız kelimelerin içindeki alt-dizeleri yanlış pozitif saymaz", () => {
    // "book" bir kelimenin içinde geçiyor ama kendi başına kelime değil
    expect(hasInquiryIntent("Facebook sayfanız var mı?")).toBe(false);
    expect(hasInquiryIntent("Notebook'umu şarj edebilir miyim?")).toBe(false);
  });

  it("'ayırt etmek' (distinguish) rezervasyon niyeti sanılmaz", () => {
    expect(hasInquiryIntent("Bu iki oda tipini ayırt edemiyorum")).toBe(false);
    expect(hasInquiryIntent("Odaları ayırt etmek zor")).toBe(false);
  });

  it("'oda ayırt' / 'ayırtmak istiyorum' gerçek rezervasyon niyeti sayılır", () => {
    expect(hasInquiryIntent("Oda ayırtmak istiyorum")).toBe(true);
    expect(hasInquiryIntent("oda ayırt edebilir miyiz")).toBe(true);
  });
});

describe("hasInquiryIntentSemantic", () => {
  beforeEach(() => {
    embedTextMock.mockReset();
  });

  it("embedding yoksa false döner, exemplar embed etmez", async () => {
    expect(await hasInquiryIntentSemantic(null)).toBe(false);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  it("mesaj embedding'i örneklerden birine yeterince yakınsa true döner", async () => {
    // exemplar embed çağrıları [1,0] döner (mock cosineSimilarity: dot product)
    embedTextMock.mockResolvedValue([1, 0]);
    const result = await hasInquiryIntentSemantic([1, 0]); // dot = 1 >= eşik
    expect(result).toBe(true);
  });

  it("mesaj embedding'i hiçbir örneğe yakın değilse false döner", async () => {
    embedTextMock.mockResolvedValue([1, 0]);
    const result = await hasInquiryIntentSemantic([0, 0.01]); // dot ~0
    expect(result).toBe(false);
  });

  it("exemplar embedding'leri yalnızca bir kez hesaplanır (önbelleklenir)", async () => {
    embedTextMock.mockResolvedValue([1, 0]);
    await hasInquiryIntentSemantic([1, 0]);
    const callsAfterFirst = embedTextMock.mock.calls.length;
    await hasInquiryIntentSemantic([1, 0]);
    expect(embedTextMock.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("shouldAllowOpenInquiryAsync", () => {
  beforeEach(() => {
    embedTextMock.mockReset().mockResolvedValue([1, 0]);
  });

  it("sync kontrol yeterliyse embedding'e hiç bakmaz", async () => {
    const result = await shouldAllowOpenInquiryAsync(0.9, "havuz nerede", null);
    expect(result).toBe(true);
  });

  it("sync kontrol yetersizse embedding tabanlı kontrole düşer", async () => {
    const result = await shouldAllowOpenInquiryAsync(0.1, "burayı tutabilir miyiz", [1, 0]);
    expect(result).toBe(true);
  });

  it("hiçbiri eşleşmezse false döner", async () => {
    const result = await shouldAllowOpenInquiryAsync(0.1, "havuz nerede", [0, 0.01]);
    expect(result).toBe(false);
  });
});

describe("getStepEndTriggerReason", () => {
  it("otomatik turda autoTourNext döner", () => {
    expect(getStepEndTriggerReason(true)).toBe("autoTourNext");
    expect(getStepEndTriggerReason(false)).toBe("stepEnd");
  });
});
