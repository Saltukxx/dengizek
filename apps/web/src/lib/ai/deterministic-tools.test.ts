import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/llm", () => ({ getEmbeddingModel: () => null, EMBEDDING_PROVIDER_OPTIONS: {} }));

import {
  extractPriceQuery,
  extractStayDates,
  hasNavigationIntent,
  matchRoomSlug,
  pickFact,
  extractConversationContext,
  isAvailabilityQuestion,
  isMissingKnownTopic,
  isRoomListQuestion,
  mentionsCatalogTerm,
  pickStep,
  planServerTools,
} from "@/lib/ai/deterministic-tools";
import type { AiFactCatalogEntry } from "@/lib/ai/types";
import { detectToolHints, serverTurnText } from "@/lib/ai/response-guard";

const TODAY = "2026-10-23";

const rooms = [
  { slug: "seaview-deluxe", name: "Deniz Manzaralı Deluxe Oda" },
  { slug: "courtyard-quiet", name: "Avlu Sessiz Oda" },
  { slug: "family-suite", name: "Aile Süiti" },
];

describe("extractStayDates", () => {
  it("aynı ay aralığı: 10-13 Ağustos 2026", () => {
    expect(extractStayDates("10-13 Ağustos 2026 için fiyat?", TODAY)).toEqual({
      checkIn: "2026-08-10",
      checkOut: "2026-08-13",
    });
  });

  it("yılsız tarih geçmişteyse gelecek yıla atar", () => {
    expect(extractStayDates("12-15 Temmuz arası", TODAY)).toEqual({
      checkIn: "2027-07-12",
      checkOut: "2027-07-15",
    });
  });

  it("ay geçişli aralık ve Türkçe ekler", () => {
    expect(extractStayDates("28 Ekim'den 2 Kasım'a kadar", TODAY)).toEqual({
      checkIn: "2026-10-28",
      checkOut: "2026-11-02",
    });
  });

  it("yıl sınırını geçen aralık", () => {
    expect(extractStayDates("28 Aralık - 2 Ocak", TODAY)).toEqual({
      checkIn: "2026-12-28",
      checkOut: "2027-01-02",
    });
  });

  it("İngilizce: August 10-13", () => {
    expect(extractStayDates("How much for August 10-13?", TODAY)).toEqual({
      checkIn: "2027-08-10",
      checkOut: "2027-08-13",
    });
  });

  it("ISO ve noktalı tarihler", () => {
    expect(extractStayDates("2026-11-01 ile 2026-11-04", TODAY)).toEqual({
      checkIn: "2026-11-01",
      checkOut: "2026-11-04",
    });
    expect(extractStayDates("01.11.2026 - 04.11.2026", TODAY)).toEqual({
      checkIn: "2026-11-01",
      checkOut: "2026-11-04",
    });
  });

  it("tek tarih + gece sayısı", () => {
    expect(extractStayDates("2 kişi 15 Kasım'dan itibaren 3 gece", TODAY)).toEqual({
      checkIn: "2026-11-15",
      checkOut: "2026-11-18",
    });
  });

  it("tarih yoksa boş döner", () => {
    expect(extractStayDates("Fiyatlarınız ne kadar?", TODAY)).toEqual({});
  });
});

describe("matchRoomSlug", () => {
  it("Türkçe oda adıyla eşleşir", () => {
    expect(matchRoomSlug("Deniz manzaralı deluxe odanın fiyatı?", rooms)).toBe("seaview-deluxe");
    expect(matchRoomSlug("avlu sessiz odanın toplam fiyatı", rooms)).toBe("courtyard-quiet");
  });

  it("İngilizce yazımı slug üzerinden yakalar", () => {
    expect(matchRoomSlug("How much is the sea view deluxe room?", rooms)).toBe("seaview-deluxe");
  });

  it("oda belirtilmemişse undefined", () => {
    expect(matchRoomSlug("Bir gece kaç para?", rooms)).toBeUndefined();
  });
});

describe("extractPriceQuery", () => {
  it("oda, tarih ve kişi sayısını birlikte çıkarır", () => {
    expect(
      extractPriceQuery("10-13 Ağustos 2026 için avlu sessiz odada 2 yetişkin 1 çocuk (5 yaşında)", rooms, TODAY),
    ).toEqual({
      roomSlug: "courtyard-quiet",
      checkIn: "2026-08-10",
      checkOut: "2026-08-13",
      guestCount: 2,
      childAges: [5],
      childCount: 1,
    });
  });

  it("genel soru: boş sorgu (tüm odalar, bugün)", () => {
    expect(extractPriceQuery("Fiyatlarınız ne kadar?", rooms, TODAY)).toEqual({});
  });
});

describe("pickFact (embedding yokken kelime eşleşmesi)", () => {
  const catalog: AiFactCatalogEntry[] = [
    { id: "spec.check_in", kind: "dogrulanmis", hint: "Check-in saati", text: "14:00" },
    { id: "spec.check_out", kind: "dogrulanmis", hint: "Check-out saati", text: "12:00" },
    { id: "policy.pets", kind: "policy", hint: "Evcil hayvan politikası", text: "Kabul edilmez" },
  ] as AiFactCatalogEntry[];

  it("check-in ile check-out'u ayırt eder", async () => {
    expect((await pickFact("Check-in saati kaçta?", null, catalog))?.factId).toBe("spec.check_in");
    expect((await pickFact("What time is check out?", null, catalog))?.factId).toBe("spec.check_out");
  });

  it("Türkçe ekli kelimeyi eşler", async () => {
    expect((await pickFact("Evcil hayvanları kabul ediyor musunuz?", null, catalog))?.factId).toBe("policy.pets");
  });
});

describe("embedding servisi yokken (kota/hata) kart seçimi", () => {
  const catalog: AiFactCatalogEntry[] = [
    { id: "spec.check_in", kind: "verified", hint: "giriş saati check-in", text: "Check-in saati: 14:00" },
    { id: "spec.check_out", kind: "verified", hint: "çıkış saati check-out", text: "Check-out saati: 12:00" },
    { id: "spec.amenities", kind: "verified", hint: "otel olanakları tesis imkanları", text: "Otel olanakları: Açık Havuz, Kapalı Termal Havuz, Kese." },
    { id: "policy.pets", kind: "policy", hint: "evcil hayvan", text: "Evcil hayvan kabul edilmez." },
    { id: "statement.0", kind: "otel_ifadesi", hint: "otel ifadesi sahibi notu", text: "Yeme İçme: Sabah kahvaltısı ve akşam yemeği açık büfe." },
    { id: "statement.1", kind: "otel_ifadesi", hint: "otel ifadesi sahibi notu", text: "Konum: Zafer Havalimanı'na 37 km." },
    { id: "statement.2", kind: "otel_ifadesi", hint: "otel ifadesi sahibi notu", text: "Giriş saati 14:00, çıkış saati 12:00 dir." },
    { id: "statement.3", kind: "otel_ifadesi", hint: "otel ifadesi sahibi notu", text: "Oda Özellikleri: Standart Oda 28 m2, iki kişilik yatak." },
    { id: "room.standart-oda.info", kind: "verified", hint: "Standart Oda oda özellikleri", title: "Standart Oda", text: "Standart Oda: 28 m², 2 yetişkin + 1 çocuk." },
  ];
  const plan = (message: string) =>
    planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog, rooms, today: TODAY });

  it.each([
    ["Giriş saati kaçta?", "spec.check_in"],
    ["Odadan en geç kaçta çıkmamız gerekiyor?", "spec.check_out"],
    ["What time is check-in?", "spec.check_in"],
    ["Köpeğimi getirebilir miyim?", "policy.pets"],
    // Otel ifadeleri yalnız metinleriyle bulunur.
    ["Yemekler dahil mi, konseptiniz nedir?", "statement.0"],
    ["Havalimanına uzaklığınız ne kadar?", "statement.1"],
    // "kişilik" geçen uzun oda metni, oda kartının önüne geçmez.
    ["Standart Oda kaç kişilik?", "room.standart-oda.info"],
  ])("%s → %s", async (message, factId) => {
    expect((await plan(message)).calls).toEqual([{ toolName: "citeFact", input: { factId } }]);
  });

  it("eşitlikte doğrulanmış bilgi otel ifadesinin önüne geçer", async () => {
    expect((await pickFact("Giriş saati kaçta?", null, catalog))?.factId).toBe("spec.check_in");
  });

  it("ipucu kelimesi olmayan soru da iki terim eşleşirse kart alır", async () => {
    expect((await plan("Termal havuzlarınızı anlatır mısınız?")).calls).toEqual([
      { toolName: "citeFact", input: { factId: "spec.amenities" } },
    ]);
  });

  it("saat/derece sorusunda olanak listesi değil, ilgili metin", async () => {
    const extra: AiFactCatalogEntry[] = [
      ...catalog,
      { id: "statement.9.0", kind: "otel_ifadesi", hint: "otel ifadesi: Aktivite", title: "Aktivite", text: "Çocuk klübü saat 11:00 ile 19:00 arasında hizmet vermektedir." },
      { id: "statement.9.1", kind: "otel_ifadesi", hint: "otel ifadesi: Termal", title: "Termal", text: "Havuzlarımız 35-38 derece sıcaklık arasındadır." },
    ];
    const ask = (message: string) =>
      planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog: extra, rooms, today: TODAY });
    expect((await ask("Çocuk kulübü kaçta açık?")).calls).toEqual([{ toolName: "citeFact", input: { factId: "statement.9.0" } }]);
    expect((await ask("Termal havuz kaç derece?")).calls).toEqual([{ toolName: "citeFact", input: { factId: "statement.9.1" } }]);
  });

  it("tek ortak kelime kart açtırmaz", async () => {
    expect((await plan("Bugün hava nasıl?")).calls).toEqual([]);
  });
});

describe("pickFact (yayında kaydedilmiş embedding'lerle)", () => {
  const catalog: AiFactCatalogEntry[] = [
    { id: "spec.address", kind: "verified", hint: "adres konum", text: "Merkez" },
    { id: "statement.0", kind: "otel_ifadesi", hint: "otel ifadesi", text: "Havalimanına 37 km." },
  ];
  const stored = new Map([
    ["spec.address", [1, 0, 0]],
    ["statement.0", [0, 1, 0]],
  ]);

  it("embedding modeli olmasa da kaydedilmiş vektörlerle anlam araması yapar", async () => {
    // Mesaj vektörü statement.0'a yakın: kelime eşleşmesi olmadan da doğru kart.
    const pick = await pickFact("Uçuştan sonra ne kadar yol var?", [0.1, 0.99, 0], catalog, stored);
    expect(pick?.factId).toBe("statement.0");
    expect(pick!.score).toBeGreaterThan(0.9);
  });

  it("bir fact'in vektörü eksikse ve üretilemiyorsa kelime eşleşmesine düşer (karışık ölçek yok)", async () => {
    const partial = new Map([["spec.address", [1, 0, 0]]]);
    const pick = await pickFact("Adresiniz nedir?", [0, 1, 0], catalog, partial);
    expect(pick?.factId).toBe("spec.address");
    expect(pick!.score).toBeLessThan(0.45); // tek kelime: eşiği geçmez
  });
});

describe("planServerToolCall", () => {
  const base = {
    messageEmbedding: null,
    inquiryIntent: "none" as const,
    catalog: [] as AiFactCatalogEntry[],
    rooms,
    today: TODAY,
  };

  it("fiyat ipucunda getRoomPrice planlar", async () => {
    const plan = await planServerTools({
      ...base,
      message: "Deniz manzaralı deluxe gecelik ne kadar?",
      hints: { needsPriceTool: true, needsFactTool: false },
    });
    expect(plan.calls).toEqual([{ toolName: "getRoomPrice", input: { roomSlug: "seaview-deluxe" } }]);
  });

  it("açık rezervasyon niyetinde openInquiry önceliklidir", async () => {
    const plan = await planServerTools({
      ...base,
      message: "Bu odayı rezerve etmek istiyorum, fiyat da öğrenmek isterim",
      inquiryIntent: "explicit",
      hints: { needsPriceTool: true, needsFactTool: false },
    });
    expect(plan.calls.map((c) => c.toolName)).toEqual(["openInquiry"]);
  });

  it("yalnız anlamsal talep benzerliği fiyat sorusunu ezmez", async () => {
    const plan = await planServerTools({
      ...base,
      message: "Fiyatlarınız ne kadar?",
      inquiryIntent: "semantic",
      hints: { needsPriceTool: true, needsFactTool: false },
    });
    expect(plan.calls.map((c) => c.toolName)).toEqual(["getRoomPrice"]);
  });

  it("iletişim sorusunda fact kartı seçmez (rehber telefon vermez)", async () => {
    const plan = await planServerTools({
      ...base,
      message: "İletişim telefon numaranız nedir?",
      hints: { needsPriceTool: false, needsFactTool: true },
      catalog: [{ id: "spec.address", kind: "verified", hint: "adres konum", text: "Adres: X" }],
    });
    expect(plan.calls).toEqual([]);
  });

  it("yalnız anlamsal talep benzerliği gezinme isteğini ezmez", async () => {
    const plan = await planServerTools({
      ...base,
      message: "Odaları görebilir miyim?",
      inquiryIntent: "semantic",
      hints: { needsPriceTool: false, needsFactTool: false },
      steps: [{ stepId: "s3", title: "Odalar", aiTags: ["oda"] }],
      currentStepId: "s1",
    });
    expect(plan.calls.map((c) => c.toolName)).toEqual(["navigateTo"]);
  });

  it("gezinme isteğinde fact zorlamaz", async () => {
    expect(hasNavigationIntent("Sahili görmek istiyorum")).toBe(true);
    expect(hasNavigationIntent("I would like to see the beach")).toBe(true);
    const plan = await planServerTools({
      ...base,
      message: "Sahili görmek istiyorum",
      hints: { needsPriceTool: false, needsFactTool: false },
    });
    expect(plan.calls).toEqual([]);
  });
});

describe("pickStep (embedding yokken kelime eşleşmesi)", () => {
  const steps = [
    { stepId: "s1", title: "Lobi", aiTags: ["giriş", "resepsiyon"] },
    { stepId: "s2", title: "Sahil ve Plaj Alanı", aiTags: ["sahil", "plaj", "deniz"] },
    { stepId: "s3", title: "Odalar", aiTags: ["oda", "deluxe", "süit"] },
  ];

  it("gezinme isteğini doğru adıma eşler", async () => {
    expect((await pickStep("Sahili görmek istiyorum", null, steps, "s1"))?.stepId).toBe("s2");
    expect((await pickStep("Odaları görebilir miyim?", null, steps, "s1"))?.stepId).toBe("s3");
  });

  it("bulunulan adımı ve eşleşmeyeni seçmez", async () => {
    expect(await pickStep("Sahili görmek istiyorum", null, steps, "s2")).toBeNull();
    expect(await pickStep("Spa'yı görebilir miyim?", null, steps, "s1")).toBeNull();
  });

  it("planlayıcı gezinme isteğinde navigateTo döndürür", async () => {
    const plan = await planServerTools({
      message: "Sahili görmek istiyorum",
      messageEmbedding: null,
      hints: { needsPriceTool: false, needsFactTool: false },
      inquiryIntent: "none",
      catalog: [],
      rooms,
      steps,
      currentStepId: "s1",
      today: TODAY,
    });
    expect(plan.calls[0]).toMatchObject({ toolName: "navigateTo", input: { stepId: "s2" } });
  });
});

describe("göreli tarihler (bugün 2026-10-23 cuma)", () => {
  it("yarın ve bu gece", () => {
    expect(extractStayDates("Yarın için fiyat?", TODAY)).toEqual({ checkIn: "2026-10-24", checkOut: "2026-10-25" });
    expect(extractStayDates("Bu gece boş oda var mı, ne kadar?", TODAY)).toEqual({ checkIn: "2026-10-23", checkOut: "2026-10-24" });
  });

  it("bu hafta sonu ve haftaya hafta sonu (cuma–pazar)", () => {
    expect(extractStayDates("Bu hafta sonu kaç para?", TODAY)).toEqual({ checkIn: "2026-10-23", checkOut: "2026-10-25" });
    expect(extractStayDates("Haftaya hafta sonu için", TODAY)).toEqual({ checkIn: "2026-10-30", checkOut: "2026-11-01" });
  });

  it("gün adları: cumartesi, haftaya cuma, next monday + gece sayısı", () => {
    expect(extractStayDates("Cumartesi 2 gece", TODAY)).toEqual({ checkIn: "2026-10-24", checkOut: "2026-10-26" });
    expect(extractStayDates("Haftaya cuma", TODAY)).toEqual({ checkIn: "2026-10-30", checkOut: "2026-10-31" });
    expect(extractStayDates("next monday for 3 nights", TODAY)).toEqual({ checkIn: "2026-10-26", checkOut: "2026-10-29" });
  });
});

describe("sohbet hafızası", () => {
  const history = [
    { role: "user", parts: [{ type: "text", text: "Deniz manzaralı deluxe 10-13 Ağustos ne kadar?" }] },
    {
      role: "assistant",
      parts: [
        {
          type: "tool-getRoomPrice",
          input: { roomSlug: "seaview-deluxe", checkIn: "2027-08-10", checkOut: "2027-08-13" },
          output: { ok: true, cards: [] },
        },
        { type: "text", text: "Güncel fiyatları kartta görebilirsiniz." },
      ],
    },
  ];
  const base = {
    messageEmbedding: null,
    hints: { needsPriceTool: false, needsFactTool: false },
    inquiryIntent: "none" as const,
    catalog: [] as AiFactCatalogEntry[],
    rooms,
    today: TODAY,
  };

  it("son fiyat sorgusunu ve önceki kullanıcı mesajlarını çıkarır (UI ve model mesajı biçimleri)", () => {
    const ctx = extractConversationContext([...history, { role: "user", content: "Peki 3 kişi olursak?" }]);
    expect(ctx.lastPriceQuery).toMatchObject({ roomSlug: "seaview-deluxe", checkIn: "2027-08-10" });
    expect(ctx.previousUserTexts[0]).toContain("deluxe");

    const modelShape = extractConversationContext([
      { role: "assistant", content: [{ type: "tool-call", toolName: "getRoomPrice", input: { roomSlug: "family-suite" } }] },
      { role: "user", content: "x" },
    ]);
    expect(modelShape.lastPriceQuery).toEqual({ roomSlug: "family-suite" });
  });

  it("takip sorusu fiyat anahtar kelimesi olmadan da önceki odayı ve tarihi korur", async () => {
    const message = "Peki 3 kişi olursak?";
    const plan = await planServerTools({
      ...base,
      message,
      context: extractConversationContext([...history, { role: "user", content: message }]),
    });
    expect(plan.calls).toEqual([
      {
        toolName: "getRoomPrice",
        input: { roomSlug: "seaview-deluxe", checkIn: "2027-08-10", checkOut: "2027-08-13", guestCount: 3 },
      },
    ]);
  });

  it("yeni tarih eski tarihin yerini alır, oda korunur", async () => {
    const message = "Peki 15-18 Temmuz için?";
    const plan = await planServerTools({
      ...base,
      message,
      context: extractConversationContext([...history, { role: "user", content: message }]),
    });
    expect(plan.calls[0]).toEqual({
      toolName: "getRoomPrice",
      input: { roomSlug: "seaview-deluxe", checkIn: "2027-07-15", checkOut: "2027-07-18" },
    });
  });

  it("fiyattan önce konuşulan odayı 'fiyatı ne kadar?' sorusunda kullanır", async () => {
    const msgs = [
      { role: "user", content: "Aile süiti hakkında bilgi verir misiniz?" },
      { role: "assistant", content: "Bilgiyi kartta paylaştım." },
      { role: "user", content: "Fiyatı ne kadar?" },
    ];
    const plan = await planServerTools({
      ...base,
      message: "Fiyatı ne kadar?",
      hints: { needsPriceTool: true, needsFactTool: false },
      context: extractConversationContext(msgs),
    });
    expect(plan.calls[0]).toEqual({ toolName: "getRoomPrice", input: { roomSlug: "family-suite" } });
  });

  it("fiyat konuşması yokken tarih içeren mesaj fiyat sayılmaz", async () => {
    const plan = await planServerTools({ ...base, message: "15 Temmuz'da geleceğiz, çok heyecanlıyız" });
    expect(plan.calls).toEqual([]);
  });
});

describe("bir mesajda iki soru ve bilinmeyen konular", () => {
  const catalog = [
    { id: "policy.cancellation", kind: "policy", hint: "iptal politikası", title: "İptal politikası", text: "48 saat önce ücretsiz iptal." },
    { id: "spec.amenities", kind: "verified", hint: "otel olanakları", text: "Otel olanakları: Havuz, Spa, Wi-Fi." },
  ] as AiFactCatalogEntry[];
  const base = {
    messageEmbedding: null,
    inquiryIntent: "none" as const,
    catalog,
    rooms,
    today: TODAY,
  };

  it("fiyat ve iptal politikası birlikte sorulunca iki kart planlar", async () => {
    const plan = await planServerTools({
      ...base,
      message: "Gecelik fiyat ne kadar, iptal politikası nedir?",
      hints: { needsPriceTool: true, needsFactTool: true },
    });
    expect(plan.calls.map((c) => c.toolName)).toEqual(["getRoomPrice", "citeFact"]);
    expect(plan.calls[1]).toMatchObject({ input: { factId: "policy.cancellation" } });
  });

  it("katalogda olmayan tesis sorusunda 'bilgim yok' cevabı planlar", async () => {
    expect(isAvailabilityQuestion("Kayak pistiniz var mı?")).toBe(true);
    expect(mentionsCatalogTerm("Kayak pistiniz var mı?", catalog)).toBe(false);
    const plan = await planServerTools({
      ...base,
      message: "Kayak pistiniz var mı?",
      hints: { needsPriceTool: false, needsFactTool: false },
    });
    expect(plan).toEqual({ calls: [], reply: "unknown" });
  });

  it("katalogdaki bir olanak sorulursa 'bilgim yok' demez", async () => {
    expect(mentionsCatalogTerm("Havuzunuz var mı?", catalog)).toBe(true);
    const plan = await planServerTools({
      ...base,
      message: "Havuzunuz var mı?",
      hints: { needsPriceTool: false, needsFactTool: false },
    });
    expect(plan.reply).toBeUndefined();
  });
});

describe("eval'da bulunan hatalar için kurallar", () => {
  const catalog = [
    { id: "spec.check_in", kind: "verified", hint: "giriş saati check-in", text: "Check-in saati: 14:00" },
    { id: "spec.amenities", kind: "verified", hint: "otel olanakları", text: "Otel olanakları: Kapalı havuz, Sauna." },
  ] as AiFactCatalogEntry[];
  const base = { messageEmbedding: null, inquiryIntent: "none" as const, catalog, rooms, today: TODAY };

  it("iletişim sorusu kart aramadan 'iletişim' cevabı alır", async () => {
    for (const message of ["Whatsapp hattınız var mı?", "What is your email address?"]) {
      const plan = await planServerTools({ ...base, message, hints: { needsPriceTool: false, needsFactTool: false } });
      expect(plan).toEqual({ calls: [], reply: "contact" });
    }
  });

  it("katalog dışı '… var mı?' sorusu fact puanına bakılmadan 'bilgim yok' alır", async () => {
    const plan = await planServerTools({ ...base, message: "Is there a casino?", hints: { needsPriceTool: false, needsFactTool: false } });
    expect(plan).toEqual({ calls: [], reply: "unknown" });
  });

  it("selamlaşma ne kart ne sabit cevap alır (model konuşur)", async () => {
    const plan = await planServerTools({ ...base, message: "Merhaba!", hints: { needsPriceTool: false, needsFactTool: false } });
    expect(plan).toEqual({ calls: [] });
  });
});

describe("ipuçları ve sabit metinler", () => {
  it("'ücretsiz' fiyat sorusu sayılmaz; köpek/dog evcil hayvan ipucudur", () => {
    expect(detectToolHints("Çocuklar ücretsiz mi?").needsPriceTool).toBe(false);
    expect(detectToolHints("Ücret ne kadar?").needsPriceTool).toBe(true);
    expect(detectToolHints("Köpeğimi getirebilir miyim?").needsFactTool).toBe(true);
    expect(detectToolHints("Can I bring my dog?").needsFactTool).toBe(true);
  });

  it("gezinme metni adımın adından ve otelin açıklamasından gelir", () => {
    const text = serverTurnText(
      { runs: [{ toolName: "navigateTo", output: { title: "Sahil ve Plaj Alanı", description: "Özel kumsal. Şezlonglar ücretsiz." } }] },
      "tr",
    );
    expect(text).toBe("Hemen “Sahil ve Plaj Alanı” bölümüne geçiyoruz. Özel kumsal.");
    expect(serverTurnText({ runs: [{ toolName: "navigateTo", output: { title: "Beach" } }] }, "en")).toBe("Taking you to “Beach” now.");
  });

  it("iletişim ve bilinmeyen konu cevapları dile göre", () => {
    expect(serverTurnText({ runs: [], reply: "contact" }, "tr")).toMatch(/iletişim bilgilerini paylaşamıyorum/);
    expect(serverTurnText({ runs: [], reply: "unknown" }, "en")).toMatch(/don't have verified information/);
  });
});

describe("fiyat niyeti — kelime sınırı ve bağlam", () => {
  it.each([
    "Plaja ne kadar uzak?",
    "Havaalanına ne kadar sürede gidilir?",
    "Separate beds?",
    "Kesinlikle görmeliyim",
    "Kahve makinesi var mı?",
    "Odada şarj aleti var mı?",
    "Ne kadar kalabiliriz?",
  ])("fiyat sorusu değil: %s", (message) => {
    expect(detectToolHints(message).needsPriceTool).toBe(false);
  });

  it.each([
    "Kalsak ne kadar?",
    "Gecesi kaç lira?",
    "Kaça kalıyor?",
    "how much is it",
    "What's the rate?",
    "İndirim var mı?",
    "next to the beach this weekend price",
  ])("fiyat sorusu: %s", (message) => {
    expect(detectToolHints(message).needsPriceTool).toBe(true);
  });

  it.each(["Otopark ücretli mi?", "Is there a parking fee?", "Kahvaltı fiyata dahil mi?", "Spa fiyatları nedir?"])(
    "olanak ücreti bilgi sorusudur, oda fiyatı değil: %s",
    (message) => {
      expect(detectToolHints(message)).toEqual({ needsPriceTool: false, needsFactTool: true });
    },
  );
});

describe("planlayıcı — tarih belirsizse fiyat göstermez, sorar", () => {
  const base = {
    messageEmbedding: null,
    inquiryIntent: "none" as const,
    catalog: [] as AiFactCatalogEntry[],
    rooms,
    today: TODAY,
  };
  const priceHints = { needsPriceTool: true, needsFactTool: false };

  it.each(["Bayramda fiyatlar ne kadar?", "Cumartesi ve pazar gecesi fiyat?", "3 gece kalsak fiyat?"])("%s", async (message) => {
    const plan = await planServerTools({ ...base, message, hints: detectToolHints(message) });
    expect(plan).toEqual({ calls: [], reply: "askDates" });
    expect(serverTurnText({ runs: [], reply: plan.reply }, "tr")).toMatch(/giriş ve çıkış tarihlerinizi/);
  });

  it("takip sorusunda tarihsiz gece sayısı önceki girişe uygulanır", async () => {
    const msgs = [
      { role: "user", content: "10-13 Ağustos 2027 fiyat?" },
      { role: "assistant", content: [{ type: "tool-call", toolName: "getRoomPrice", input: { checkIn: "2027-08-10", checkOut: "2027-08-13" } }] },
      { role: "user", content: "Peki 5 gece olursa?" },
    ];
    const plan = await planServerTools({
      ...base,
      message: "Peki 5 gece olursa?",
      hints: { needsPriceTool: false, needsFactTool: false },
      context: extractConversationContext(msgs),
    });
    expect(plan.calls[0]).toEqual({ toolName: "getRoomPrice", input: { checkIn: "2027-08-10", checkOut: "2027-08-15" } });
  });

  it("ay sorusunda ay sorgusu planlar", async () => {
    const plan = await planServerTools({ ...base, message: "Temmuzda fiyatlar ne kadar?", hints: priceHints });
    expect(plan.calls[0]).toEqual({ toolName: "getRoomPrice", input: { month: "2027-07" } });
  });
});

describe("fiyat turu metni anlaşılan sorguyu geri söyler", () => {
  const run = (output: unknown) => ({ runs: [{ toolName: "getRoomPrice" as const, output }] });

  it("tarih, gece ve kişi", () => {
    const output = { ok: true, cards: [], query: { checkIn: "2027-08-10", checkOut: "2027-08-13", guestCount: 2, childAges: [5], childCount: 1 } };
    expect(serverTurnText(run(output), "tr")).toBe(
      "10–13 Ağustos 2027 (3 gece), 2 yetişkin ve 1 çocuk (5 yaş) için fiyatlar kartta. Tarih ya da kişi sayısı farklıysa yazmanız yeterli.",
    );
    expect(serverTurnText(run(output), "en")).toMatch(/^Prices for 10–13 August 2027 \(3 nights\), 2 adults and 1 child \(5 yrs\) are on the card\./);
  });

  it("yaşı bilinmeyen çocuk için yaş ister", () => {
    const output = { ok: true, cards: [], query: { checkIn: "2027-08-10", checkOut: "2027-08-11", guestCount: 2, childCount: 1 } };
    expect(serverTurnText(run(output), "tr")).toMatch(/çocukların yaşlarını yazarsanız/);
  });

  it("hata kodunu İngilizcede de açıklar", () => {
    const output = { ok: false, cards: [], error: "Giriş tarihi geçmişte kalıyor.", errorCode: "past_date" };
    expect(serverTurnText(run(output), "tr")).toMatch(/^Giriş tarihi geçmişte kalıyor\./);
    expect(serverTurnText(run(output), "en")).toMatch(/^That date is already in the past\./);
  });
});

describe("takip: 'aynı tarihlerde' önceki tarihleri kullanır", () => {
  it("oda değişir, tarih korunur", async () => {
    const msgs = [
      { role: "user", content: "Deniz manzaralı deluxe 10-13 Ağustos ne kadar?" },
      { role: "assistant", content: [{ type: "tool-call", toolName: "getRoomPrice", input: { roomSlug: "seaview-deluxe", checkIn: "2027-08-10", checkOut: "2027-08-13" } }] },
      { role: "user", content: "Avlu sessiz oda için aynı tarihlerde fiyat ne olur?" },
    ];
    const message = "Avlu sessiz oda için aynı tarihlerde fiyat ne olur?";
    const plan = await planServerTools({
      messageEmbedding: null,
      inquiryIntent: "none",
      catalog: [],
      rooms,
      today: TODAY,
      message,
      hints: detectToolHints(message),
      context: extractConversationContext(msgs),
    });
    expect(plan.calls[0]).toEqual({
      toolName: "getRoomPrice",
      input: { roomSlug: "courtyard-quiet", checkIn: "2027-08-10", checkOut: "2027-08-13" },
    });
  });
});

describe("olanak sorusu planı", () => {
  const catalog: AiFactCatalogEntry[] = [
    {
      id: "spec.amenities",
      kind: "verified",
      hint: "otel olanakları",
      text: "Otel olanakları: Fitness Center, Kese, Otopark.",
      items: ["Fitness Center", "Kese", "Otopark"],
    },
    { id: "statement.0", kind: "otel_ifadesi", hint: "otel ifadesi", text: "Tesiste tenis kortu bulunmaktadır." },
  ];
  const plan = (message: string) =>
    planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog, rooms, today: TODAY });

  it("listede varsa: kart + eşleşen olanaklar, model çağrılmaz", async () => {
    expect(await plan("fitness var mı?")).toEqual({
      calls: [{ toolName: "citeFact", input: { factId: "spec.amenities" } }],
      amenities: ["Fitness Center"],
    });
    expect((await plan("Do you have a gym?")).amenities).toEqual(["Fitness Center"]);
  });

  it("ücret sorulursa işaretlenir", async () => {
    expect(await plan("Ücretsiz otopark var mı?")).toMatchObject({ amenities: ["Otopark"], amenityPriceAsked: true });
  });

  it("bilinen olanak ne listede ne metinde: bilgim yok", async () => {
    expect(await plan("Spa var mı?")).toEqual({ calls: [], reply: "unknown" });
    expect(await plan("Is there a pool?")).toEqual({ calls: [], reply: "unknown" });
  });

  it("listede yok ama otelin metninde geçiyor: 'bilgim yok' denmez", async () => {
    expect((await plan("Tenis kortu var mı?")).reply).not.toBe("unknown");
  });
});

describe("otelin verisinde hiç olmayan bilinen konu", () => {
  const withoutTimes: AiFactCatalogEntry[] = [
    { id: "policy.manual.0", kind: "policy", hint: "otel politikası", text: "Rezervasyonlar ön ödemelidir." },
  ];
  const withTimesInText: AiFactCatalogEntry[] = [
    { id: "policy.manual.0", kind: "policy", hint: "otel politikası", text: "Giriş saati 14:00, çıkış saati ise 12:00'dir." },
  ];

  it.each(["Giriş saati kaçta?", "What time is check-in?", "Odadan en geç kaçta çıkmamız gerekiyor?", "Köpeğimi getirebilir miyim?"])(
    "%s → bilgim yok",
    async (message) => {
      expect(isMissingKnownTopic(message, withoutTimes)).toBe(true);
      const plan = await planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog: withoutTimes, rooms, today: TODAY });
      expect(plan).toEqual({ calls: [], reply: "unknown" });
    },
  );

  it("bilgi otel metninde geçiyorsa 'bilgim yok' denmez", () => {
    expect(isMissingKnownTopic("Giriş saati kaçta?", withTimesInText)).toBe(false);
    expect(isMissingKnownTopic("Odadan en geç kaçta çıkmamız gerekiyor?", withTimesInText)).toBe(false);
  });

  it("saat sorulmuyorsa (ör. giriş işlemleri) konu sayılmaz", () => {
    expect(isMissingKnownTopic("Girişte pasaport gerekli mi?", withoutTimes)).toBe(false);
  });
});

describe("oda listesi sorusu", () => {
  const catalog: AiFactCatalogEntry[] = [
    { id: "spec.amenities", kind: "verified", hint: "otel olanakları", text: "Otel olanakları: Havuz, Kese.", items: ["Havuz", "Kese"] },
    { id: "room.aile-odasi.info", kind: "verified", hint: "Aile Odası oda özellikleri", title: "Aile Odası", text: "Aile Odası: 39 m², 2 yetişkin + 3 çocuk, Yarım pansiyon." },
    { id: "room.kose-suit.info", kind: "verified", hint: "Köşe Suit oda özellikleri", title: "Köşe Suit", text: "Köşe Suit: 40 m², 2 yetişkin + 2 çocuk." },
    { id: "room.kose-suit.pricing_notes", kind: "verified", hint: "Köşe Suit fiyat notu", title: "Köşe Suit", text: "Hafta sonu farkı uygulanır." },
  ];

  it.each(["Hangi odalarınız var?", "Oda tipleriniz neler?", "Odalarınızı anlatır mısınız?", "Ne tür odalar var?", "What rooms do you have?", "Room types?"])(
    "%s → oda listesi",
    async (message) => {
      expect(isRoomListQuestion(message)).toBe(true);
      const plan = await planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog, rooms, today: TODAY });
      expect(plan).toEqual({
        calls: [],
        reply: "rooms",
        rooms: ["Aile Odası: 39 m², 2 yetişkin + 3 çocuk, Yarım pansiyon.", "Köşe Suit: 40 m², 2 yetişkin + 2 çocuk."],
      });
    },
  );

  it.each(["Odalarınızda klima var mı?", "Standart oda kaç kişilik?", "Otelde kaç oda var?", "Odada minibar var mı?"])("%s → oda listesi değil", (message) => {
    expect(isRoomListQuestion(message)).toBe(false);
  });

  it("odası olmayan otelde 'bilgim yok'", async () => {
    const plan = await planServerTools({ message: "Hangi odalarınız var?", messageEmbedding: null, hints: detectToolHints("Hangi odalarınız var?"), inquiryIntent: "none", catalog: catalog.slice(0, 1), rooms: [], today: TODAY });
    expect(plan).toEqual({ calls: [], reply: "unknown" });
  });

  it("fiyat sorusu oda listesine dönmez", async () => {
    const message = "Hangi odanın fiyatı en uygun?";
    const plan = await planServerTools({ message, messageEmbedding: null, hints: detectToolHints(message), inquiryIntent: "none", catalog, rooms, today: TODAY });
    expect(plan.reply).not.toBe("rooms");
  });
});
