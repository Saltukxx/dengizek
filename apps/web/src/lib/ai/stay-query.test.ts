import { describe, expect, it } from "vitest";
import { parseGuests, parseStayDates } from "@/lib/ai/stay-query";

// 2026-10-23 bir cuma.
const TODAY = "2026-10-23";

function stay(message: string) {
  const r = parseStayDates(message, TODAY);
  return { checkIn: r.checkIn, checkOut: r.checkOut, month: r.month, nights: r.nights, ask: r.needsClarification };
}

describe("parseStayDates — açık tarihler", () => {
  it.each([
    ["10-13 Ağustos 2027 için fiyat?", "2027-08-10", "2027-08-13"],
    ["10 ile 13 ağustos arası", "2027-08-10", "2027-08-13"],
    ["28 Ekim'den 2 Kasım'a kadar", "2026-10-28", "2026-11-02"],
    ["28 Aralık - 2 Ocak", "2026-12-28", "2027-01-02"],
    ["10 ağustos'ta giriş 15'inde çıkış, fiyat?", "2027-08-10", "2027-08-15"],
    ["giriş 10 ağustos çıkış 15 ağustos", "2027-08-10", "2027-08-15"],
    ["Temmuz'un 10'u fiyat", "2027-07-10", "2027-07-11"],
    ["15 Kasım'dan itibaren 3 gece", "2026-11-15", "2026-11-18"],
    ["fiyat 3 gece 2 kişi 20 ağustos", "2027-08-20", "2027-08-23"],
    ["10 ağustos 2 kişi fiyat", "2027-08-10", "2027-08-11"],
    ["15:00 check-in, 10 ağustos fiyat", "2027-08-10", "2027-08-11"],
  ])("TR: %s", (message, checkIn, checkOut) => {
    expect(stay(message)).toMatchObject({ checkIn, checkOut, ask: false });
  });

  it.each([
    ["How much for August 10-13?", "2027-08-10", "2027-08-13"],
    ["August 10th to 13th price", "2027-08-10", "2027-08-13"],
    ["10th of August price", "2027-08-10", "2027-08-11"],
    ["price august 3rd to 6th", "2027-08-03", "2027-08-06"],
    ["aug 28 - sep 2", "2027-08-28", "2027-09-02"],
    ["July 15, 2 people price", "2027-07-15", "2027-07-16"],
  ])("EN: %s", (message, checkIn, checkOut) => {
    expect(stay(message)).toMatchObject({ checkIn, checkOut, ask: false });
  });

  it.each([
    ["2026-11-01 ile 2026-11-04", "2026-11-01", "2026-11-04"],
    ["01.11.2026 - 04.11.2026", "2026-11-01", "2026-11-04"],
    ["10.08 - 13.08 fiyat", "2027-08-10", "2027-08-13"],
    ["10/08-13/08 fiyat", "2027-08-10", "2027-08-13"],
    ["28.12-02.01 fiyat", "2026-12-28", "2027-01-02"],
  ])("sayısal: %s", (message, checkIn, checkOut) => {
    expect(stay(message)).toMatchObject({ checkIn, checkOut, ask: false });
  });

  it("geçmiş yıl açıkça yazıldıysa korunur (fiyat motoru reddeder)", () => {
    expect(stay("12 Ağustos 2025 fiyat")).toMatchObject({ checkIn: "2025-08-12", ask: false });
  });
});

describe("parseStayDates — sayı tarih sanılmaz", () => {
  it.each([
    "1 junior suite fiyatı",
    "2 kişi için fiyat",
    "Plaj 2.5 km uzaklıkta mı?",
    "Check-in 14.00 mı?",
    "Fiyatlarınız ne kadar?",
    "fiyat aralığı nedir",
    "May I ask the price?",
  ])("%s", (message) => {
    const r = parseStayDates(message, TODAY);
    expect(r.checkIn).toBeUndefined();
    expect(r.month).toBeUndefined();
    expect(r.needsClarification).toBe(false);
  });
});

describe("parseStayDates — göreli tarihler (bugün cuma)", () => {
  it.each([
    ["Yarına oda var mı, fiyat?", "2026-10-24", "2026-10-25"],
    ["Yarından sonra için fiyat", "2026-10-25", "2026-10-26"],
    ["Yarından itibaren 2 gece", "2026-10-24", "2026-10-26"],
    ["Bu gece boş oda var mı?", "2026-10-23", "2026-10-24"],
    ["Bu cuma fiyat", "2026-10-23", "2026-10-24"],
    ["Cumaya fiyat ne?", "2026-10-30", "2026-10-31"],
    ["Haftaya cuma", "2026-10-30", "2026-10-31"],
    ["Cumartesi 2 gece", "2026-10-24", "2026-10-26"],
    ["Cumadan pazara fiyat?", "2026-10-30", "2026-11-01"],
    ["cuma-pazar fiyat", "2026-10-30", "2026-11-01"],
    ["Pazara kadar kalsak ne kadar?", "2026-10-23", "2026-10-25"],
    ["Bu hafta sonu kaç para?", "2026-10-23", "2026-10-25"],
    ["Haftaya hafta sonu için", "2026-10-30", "2026-11-01"],
    ["next monday for 3 nights", "2026-10-26", "2026-10-29"],
    ["2 hafta sonra 3 gece fiyat", "2026-11-06", "2026-11-09"],
    ["in 10 days for 2 nights how much", "2026-11-02", "2026-11-04"],
  ])("%s", (message, checkIn, checkOut) => {
    expect(stay(message)).toMatchObject({ checkIn, checkOut, ask: false });
  });

  it("'pazarlık' pazar günü değildir", () => {
    expect(stay("Fiyatta pazarlık olur mu?").checkIn).toBeUndefined();
  });
});

describe("parseStayDates — ay ve süre", () => {
  it.each([
    ["Temmuzda fiyatlar ne kadar?", "2027-07"],
    ["Ekimde fiyat?", "2026-10"],
    ["Aralık ayında fiyat", "2026-12"],
    ["May I ask the price for June?", "2027-06"],
    ["the price in may", "2027-05"],
  ])("ay: %s", (message, month) => {
    expect(stay(message)).toMatchObject({ month, checkIn: undefined, ask: false });
  });

  it.each([
    ["üç gece kalsak fiyat?", 3],
    ["1 hafta kalsak ne kadar?", 7],
    ["two weeks price", 14],
  ])("tarihsiz süre: %s", (message, nights) => {
    expect(stay(message)).toMatchObject({ nights, checkIn: undefined, ask: false });
  });
});

describe("parseStayDates — belirsizse tahmin etmez, sorar", () => {
  it.each([
    "Cumartesi ve pazar gecesi fiyat", // 1 gece mi 2 gece mi?
    "Yarın veya cuma fiyat",
    "3-4 gece kalsak fiyat",
    "2 maybe 3 nights price",
    "10-13 Ağustos 5 gece fiyat", // aralık 3 gece, mesaj 5 gece diyor
    "31 Şubat fiyat",
    "Bayramda fiyatlar?",
    "Gelecek hafta fiyat?",
    "Yılbaşı fiyatı?",
  ])("%s", (message) => {
    expect(stay(message).ask).toBe(true);
  });
});

describe("parseGuests", () => {
  it.each([
    ["2 yetişkin 2 çocuk (5 ve 8 yaşında)", { guestCount: 2, childCount: 2, childAges: [5, 8] }],
    ["1 adult 2 kids aged 4 and 7", { guestCount: 1, childCount: 2, childAges: [4, 7] }],
    ["2 adults and 1 child aged 6", { guestCount: 2, childCount: 1, childAges: [6] }],
    ["2 yetişkin, 12 yaş altı 1 çocuk", { guestCount: 2, childCount: 1 }],
    ["2 kişi ve 6 aylık bebek", { guestCount: 2, childCount: 1, childAges: [0] }],
    ["iki kişi için", { guestCount: 2 }],
    ["Bir çift için 3 gece", { guestCount: 2 }],
    ["Eşimle geleceğiz", { guestCount: 2 }],
    ["5 kişilik oda", { guestCount: 5 }],
  ])("%s", (message, expected) => {
    expect(parseGuests(message)).toEqual(expected);
  });
});

describe("önceki sorguya gönderme belirsizlik değildir", () => {
  it.each(["Avlu sessiz oda için aynı tarihlerde fiyat ne olur?", "Same dates for the family suite?", "Bu tarihlerde 3 kişi olursak?"])(
    "%s",
    (message) => {
      expect(parseStayDates(message, TODAY).needsClarification).toBe(false);
    },
  );
});
