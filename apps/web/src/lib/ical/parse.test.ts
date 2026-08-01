import { describe, expect, it } from "vitest";
import { parseIcal, parseIcalDate } from "@/lib/ical/parse";

function feed(body: string) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

const oneEvent = feed(
  [
    "BEGIN:VEVENT",
    "UID:abc-123",
    "DTSTART;VALUE=DATE:20260801",
    "DTEND;VALUE=DATE:20260805",
    "SUMMARY:Booking.com rezervasyonu",
    "END:VEVENT",
  ].join("\r\n"),
);

describe("parseIcalDate", () => {
  it("DATE biçimini çevirir", () => {
    expect(parseIcalDate("20260801")).toBe("2026-08-01");
  });

  it("DATE-TIME'dan saati atar", () => {
    expect(parseIcalDate("20260801T140000Z")).toBe("2026-08-01");
  });

  it("geçersiz değerde null döner", () => {
    expect(parseIcalDate("yarin")).toBeNull();
    expect(parseIcalDate("20261301")).toBeNull();
  });
});

describe("parseIcal", () => {
  it("tek olayı ayrıştırır", () => {
    expect(parseIcal(oneEvent)).toEqual([
      {
        uid: "abc-123",
        start: "2026-08-01",
        end: "2026-08-05",
        summary: "Booking.com rezervasyonu",
      },
    ]);
  });

  it("katlanmış satırları birleştirir", () => {
    const folded = feed(
      [
        "BEGIN:VEVENT",
        "UID:abc-123",
        "DTSTART;VALUE=DATE:20260801",
        "DTEND;VALUE=DATE:20260805",
        "SUMMARY:Uzun bir ",
        " rezervasyon notu",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseIcal(folded)[0].summary).toBe("Uzun bir rezervasyon notu");
  });

  it("kaçışlı metni çözer", () => {
    const escaped = feed(
      [
        "BEGIN:VEVENT",
        "UID:x",
        "DTSTART:20260801",
        "DTEND:20260802",
        "SUMMARY:Ada\\, Lovelace\\; 2 kişi",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseIcal(escaped)[0].summary).toBe("Ada, Lovelace; 2 kişi");
  });

  it("çoklu olayları döner", () => {
    const two = feed(
      [
        "BEGIN:VEVENT",
        "UID:a",
        "DTSTART:20260801",
        "DTEND:20260803",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:b",
        "DTSTART:20260810",
        "DTEND:20260812",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseIcal(two).map((e) => e.uid)).toEqual(["a", "b"]);
  });

  it("eksik/bozuk olayı atlar, sağlamı korur", () => {
    const mixed = feed(
      [
        "BEGIN:VEVENT",
        "UID:eksik-tarih",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:ters-tarih",
        "DTSTART:20260810",
        "DTEND:20260805",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:saglam",
        "DTSTART:20260901",
        "DTEND:20260903",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseIcal(mixed).map((e) => e.uid)).toEqual(["saglam"]);
  });

  it("boş akışta boş dizi döner", () => {
    expect(parseIcal("")).toEqual([]);
    expect(parseIcal(feed(""))).toEqual([]);
  });

  it("CRLF olmayan (yalnızca LF) akışı da okur", () => {
    expect(parseIcal(oneEvent.replace(/\r\n/g, "\n"))).toHaveLength(1);
  });
});
