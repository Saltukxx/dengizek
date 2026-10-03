import { describe, expect, it } from "vitest";
import { addDays, assignLanes, classifyToday, dayRange, stayState } from "./booking-stay";

const base = { status: "onaylandi" as const, checkIn: "2026-12-10", checkOut: "2026-12-12" };

describe("stayState", () => {
  it("onaylı kaydı giriş/çıkış anına göre ayırır", () => {
    expect(stayState(base)).toBe("onaylandi");
    expect(stayState({ ...base, checkedInAt: "2026-12-10T12:00:00Z" })).toBe("konakliyor");
    expect(
      stayState({ ...base, checkedInAt: "2026-12-10T12:00:00Z", checkedOutAt: "2026-12-12T08:00:00Z" }),
    ).toBe("cikis_yapti");
  });

  it("onaylı olmayan durumda giriş damgasını yok sayar", () => {
    expect(stayState({ ...base, status: "iptal", checkedInAt: "2026-12-10T12:00:00Z" })).toBe("iptal");
    expect(stayState({ ...base, status: "beklemede" })).toBe("beklemede");
  });
});

describe("classifyToday", () => {
  const today = "2026-12-10";
  const inAt = "2026-12-09T13:00:00Z";

  it("giriş, çıkış ve konaklayanları ayrı listeler", () => {
    const arrival = { id: "a", ...base };
    const leaving = { id: "l", ...base, checkIn: "2026-12-08", checkOut: today, checkedInAt: inAt };
    const staying = { id: "s", ...base, checkIn: "2026-12-09", checkOut: "2026-12-13", checkedInAt: inAt };
    const result = classifyToday([arrival, leaving, staying], today);
    expect(result.arrivals).toEqual([arrival]);
    expect(result.departures).toEqual([leaving]);
    expect(result.inHouse).toEqual([staying]);
  });

  it("çıkış tarihi geçmiş ama hâlâ içerideki misafiri çıkış listesinde tutar", () => {
    const overdue = { id: "o", ...base, checkIn: "2026-12-05", checkOut: "2026-12-08", checkedInAt: inAt };
    expect(classifyToday([overdue], today).departures).toEqual([overdue]);
  });

  it("girişi geçmiş, giriş yapmamış onaylı kaydı uyarıya alır; yarınki girişi almaz", () => {
    const late = { id: "x", ...base, checkIn: "2026-12-09", checkOut: "2026-12-11" };
    const tomorrow = { id: "t", ...base, checkIn: "2026-12-11", checkOut: "2026-12-13" };
    const result = classifyToday([late, tomorrow], today);
    expect(result.lateArrivals).toEqual([late]);
    expect(result.arrivals).toEqual([]);
  });

  it("yalnız girişi gelmiş bekleyen kaydı acil sayar; iptal ve gelmediyi hiç saymaz", () => {
    const urgent = { id: "p", ...base, status: "beklemede" as const };
    const future = { id: "f", ...base, status: "beklemede" as const, checkIn: "2026-12-20", checkOut: "2026-12-22" };
    const cancelled = { id: "c", ...base, status: "iptal" as const };
    const noShow = { id: "n", ...base, status: "no_show" as const };
    const result = classifyToday([urgent, future, cancelled, noShow], today);
    expect(result.pending).toEqual([urgent]);
    expect(result.arrivals).toEqual([]);
    expect(result.inHouse).toEqual([]);
  });
});

describe("takvim yardımcıları", () => {
  it("ay ve yıl sınırını aşarak gün ekler", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(dayRange("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("çakışan konaklamaları ayrı şeride, ardışık olanları aynı şeride koyar", () => {
    const a = { id: "a", checkIn: "2026-12-10", checkOut: "2026-12-12" };
    const b = { id: "b", checkIn: "2026-12-11", checkOut: "2026-12-13" };
    const c = { id: "c", checkIn: "2026-12-12", checkOut: "2026-12-14" };
    const { placed, laneCount } = assignLanes([c, a, b]);
    const lane = Object.fromEntries(placed.map((p) => [p.booking.id, p.lane]));
    expect(lane).toEqual({ a: 0, b: 1, c: 0 });
    expect(laneCount).toBe(2);
  });

  it("kayıt yokken tek şerit döner", () => {
    expect(assignLanes([]).laneCount).toBe(1);
  });
});
