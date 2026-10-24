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
