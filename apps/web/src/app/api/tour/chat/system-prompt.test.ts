// ---------------------------------------------------------------------------
// Sistem prompt'u — içerik bütünlüğü + caching için sabit önek.
//
// Prompt caching yalnızca BAYT BAYT AYNI önek için çalışır. Bu testler,
// bir tur oturumu boyunca değişmemesi gereken bloğun gerçekten değişmediğini
// kilitler; aksi halde dinamik bir alan sessizce öne kayıp cache'i öldürebilir.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./route";

type Ctx = Parameters<typeof buildSystemPrompt>[0];

function ctx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    messages: [],
    hotelSlug: "aurelia-bay",
    tourId: "demo-lobby",
    currentStepId: "s1",
    stepsSeen: ["s1"],
    triggerReason: "userMessage",
    isAutoTour: false,
    hotelName: "Aurelia Bay",
    hotelProfile: { aiPersona: "Deniz", language: "tr" },
    availableSteps: [
      { stepId: "s1", title: "Lobi", aiTags: ["lobi"], aiDescription: "Giriş" },
      { stepId: "s2", title: "Sahil", aiTags: ["plaj"] },
    ],
    factCatalog: [],
    roomOptions: [{ slug: "seaview", name: "Deniz Manzaralı" }],
    completion: {
      seenCount: 1,
      totalCount: 2,
      progressRatio: 0.5,
      nextStepId: "s2",
      nextStepTitle: "Sahil",
      remainingStepIds: ["s2"],
      isComplete: false,
    },
    userMessageEmbedding: null,
    ...overrides,
  } as Ctx;
}

/** Sabit önek = "DİL:" başlığına kadar olan kısım. */
function stablePrefix(prompt: string): string {
  const i = prompt.indexOf("DİL:");
  expect(i).toBeGreaterThan(0);
  return prompt.slice(0, i);
}

describe("buildSystemPrompt — içerik", () => {
  it("persona, otel adı, adımlar ve odalar yer alır", () => {
    const p = buildSystemPrompt(ctx());
    expect(p).toContain("Deniz");
    expect(p).toContain("Aurelia Bay");
    expect(p).toContain('stepId: "s1"');
    expect(p).toContain("seaview: Deniz Manzaralı");
  });

  it("kesin kurallar korunur", () => {
    const p = buildSystemPrompt(ctx());
    expect(p).toContain("Serbest metinde ASLA fiyat");
    expect(p).toContain("MUTLAKA getRoomPrice");
    expect(p).toContain("MUTLAKA citeFact");
  });

  it("ilerleme ve sıradaki adım dinamik bölümde", () => {
    const p = buildSystemPrompt(ctx());
    expect(p).toContain("Tur ilerlemesi: 1/2");
    expect(p).toContain('"s2"');
  });

  it("otomatik tur bilgisi yansır", () => {
    expect(buildSystemPrompt(ctx({ isAutoTour: true }))).toContain("OTOMATİK TUR AKTİF");
  });
});

describe("buildSystemPrompt — sabit önek (prompt caching)", () => {
  const base = stablePrefix(buildSystemPrompt(ctx()));

  it("ilerleme değişince önek DEĞİŞMEZ", () => {
    const other = buildSystemPrompt(
      ctx({
        stepsSeen: ["s1", "s2"],
        completion: {
          seenCount: 2,
          totalCount: 2,
          progressRatio: 1,
          nextStepId: null,
          nextStepTitle: null,
          remainingStepIds: [],
          isComplete: true,
        },
      }),
    );
    expect(stablePrefix(other)).toBe(base);
  });

  it("adım değişince önek DEĞİŞMEZ", () => {
    expect(stablePrefix(buildSystemPrompt(ctx({ currentStepId: "s2" })))).toBe(base);
  });

  it("dil değişince önek DEĞİŞMEZ", () => {
    expect(stablePrefix(buildSystemPrompt(ctx({ detectedLanguage: "en" })))).toBe(base);
  });

  it("tetikleyici değişince önek DEĞİŞMEZ", () => {
    expect(stablePrefix(buildSystemPrompt(ctx({ triggerReason: "idle" })))).toBe(base);
  });

  it("fact kataloğu değişince önek DEĞİŞMEZ (filtreleme her mesajda değişir)", () => {
    const withFacts = buildSystemPrompt(
      ctx({
        factCatalog: [
          { id: "f1", kind: "policy", hint: "iptal", text: "48 saat" },
        ] as Ctx["factCatalog"],
      }),
    );
    expect(stablePrefix(withFacts)).toBe(base);
    // Katalog prompt'a yalnızca id + ipucu yazar; fact METNİ citeFact
    // aracıyla döner (tasarım gereği — prompt'ta metin taşımıyoruz).
    expect(withFacts).toContain("f1");
    expect(withFacts).toContain("iptal");
  });

  it("otel değişince önek DEĞİŞİR (cache oteller arası paylaşılmamalı)", () => {
    expect(stablePrefix(buildSystemPrompt(ctx({ hotelName: "Başka Otel" })))).not.toBe(base);
  });

  it("önek anlamlı uzunlukta — caching eşiğini geçebilmeli", () => {
    expect(base.length).toBeGreaterThan(600);
  });
});
