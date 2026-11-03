import { describe, expect, it } from "vitest";
import { isRoomFeature, roomLacksFeature, roomsLackingFeature } from "@/lib/ai/room-features";
import { amenityAnswerText } from "@/lib/ai/response-guard";

describe("oda özellikleri", () => {
  it("oda özelliği / otel olanağı ayrımı", () => {
    expect(isRoomFeature("Balkon")).toBe(true);
    expect(isRoomFeature("Split Klima")).toBe(true);
    expect(isRoomFeature("Saç Kurutma Makinesi")).toBe(true);
    expect(isRoomFeature("Açık Havuz")).toBe(false);
    // Hem otelde hem odada olabilir: otel olanağı sayılır.
    expect(isRoomFeature("Jakuzi")).toBe(false);
  });

  it("özelliğin olmadığını söyleyen oda metni", () => {
    expect(roomLacksFeature("Öne Çıkan Özellikler: Balkonsuzdur.", "Balkon")).toBe(true);
    expect(roomLacksFeature("Standart Balkonsuz Küvetli Oda", "Balkon")).toBe(true);
    expect(roomLacksFeature("Odada minibar bulunmamaktadır.", "Minibar")).toBe(true);
    expect(roomLacksFeature("Geniş balkon, minibar.", "Balkon")).toBe(false);
    expect(roomLacksFeature("Balkonsuzdur.", "Minibar")).toBe(false);
  });

  it("bulunmayan odalar (oda adı veya açıklamasından, tekrar etmeden)", () => {
    const catalog = [
      { id: "room.a.info", title: "Standart Balkonsuz Oda", text: "2 yetişkin" },
      { id: "room.a.details", title: "Standart Balkonsuz Oda", text: "Balkonsuzdur." },
      { id: "room.b.details", title: "Suit", text: "Geniş balkon." },
      { id: "statement.0", text: "Balkonsuz odalar ek binadadır." },
    ];
    expect(roomsLackingFeature("Balkon", catalog)).toEqual(["Standart Balkonsuz Oda"]);
  });

  it("cevap metni", () => {
    expect(amenityAnswerText(["Balkon"], false, false, { exceptions: ["Standart Balkonsuz Oda"] })).toBe(
      "Evet, odalarda “Balkon” bulunuyor. Şu odalarda bulunmuyor: “Standart Balkonsuz Oda”.",
    );
    expect(amenityAnswerText(["Balkon"], false, true, { exceptions: [] })).toBe("Yes, the rooms have “Balkon”.");
    expect(amenityAnswerText(["Açık Havuz"], false, false)).toBe("Evet, tesiste “Açık Havuz” bulunuyor.");
  });
});
