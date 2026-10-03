// ---------------------------------------------------------------------------
// Rezervasyonun misafire/yöneticiye görünen konaklama durumu.
//
// DB durumu dört değerdir (beklemede | onaylandi | iptal | no_show); giriş ve
// çıkış checkedInAt / checkedOutAt ile tutulur. Ekranlar bu ikisini tek bir
// "konaklama durumu"na indirger. Saf fonksiyonlar — istemci ve sunucu ortak.
// ---------------------------------------------------------------------------

export type StayState =
  | "beklemede"
  | "onaylandi"
  | "konakliyor"
  | "cikis_yapti"
  | "iptal"
  | "no_show";

export interface StayBooking {
  status: "beklemede" | "onaylandi" | "iptal" | "no_show";
  checkIn: string;
  checkOut: string;
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
}

export function stayState(b: StayBooking): StayState {
  if (b.status !== "onaylandi") return b.status;
  if (b.checkedOutAt) return "cikis_yapti";
  if (b.checkedInAt) return "konakliyor";
  return "onaylandi";
}

export const stayStateLabels: Record<StayState, string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  konakliyor: "Konaklıyor",
  cikis_yapti: "Çıkış yaptı",
  iptal: "İptal",
  no_show: "Gelmedi",
};

export const stayStateColors: Record<StayState, string> = {
  beklemede: "yellow",
  onaylandi: "blue",
  konakliyor: "teal",
  cikis_yapti: "gray",
  iptal: "red",
  no_show: "orange",
};

export const STAY_STATES = Object.keys(stayStateLabels) as StayState[];

export function isStayState(value: string | null | undefined): value is StayState {
  return value != null && (STAY_STATES as string[]).includes(value);
}

/** Bugünün iş listesi — genel bakıştaki üç sütun ve iki uyarı. */
export function classifyToday<T extends StayBooking>(bookings: T[], today: string) {
  const arrivals: T[] = [];
  const departures: T[] = [];
  const inHouse: T[] = [];
  const lateArrivals: T[] = [];
  const pending: T[] = [];
  for (const b of bookings) {
    const state = stayState(b);
    if (state === "beklemede") {
      // Onay bekleyen ve girişi bugün ya da geçmişte olan kayıt acildir.
      if (b.checkIn <= today && b.checkOut > today) pending.push(b);
      continue;
    }
    if (state === "onaylandi") {
      if (b.checkIn === today) arrivals.push(b);
      else if (b.checkIn < today && b.checkOut >= today) lateArrivals.push(b);
      continue;
    }
    if (state === "konakliyor") {
      if (b.checkOut <= today) departures.push(b);
      else inHouse.push(b);
    }
  }
  return { arrivals, departures, inHouse, lateArrivals, pending };
}

/** YYYY-MM-DD üzerinde gün ekler (saat dilimi kaymasız). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/**
 * Takvim satırında çakışan rezervasyonları şeritlere yerleştirir: her kayıt,
 * kendisinden önce biten ilk şeride girer. Dönen dizi kayıtla aynı sıradadır.
 */
export function assignLanes<T extends { checkIn: string; checkOut: string }>(bookings: T[]) {
  const sorted = [...bookings].sort(
    (a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut),
  );
  const laneEnds: string[] = [];
  const placed = sorted.map((booking) => {
    let lane = laneEnds.findIndex((end) => end <= booking.checkIn);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(booking.checkOut);
    } else {
      laneEnds[lane] = booking.checkOut;
    }
    return { booking, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}
