/** Giriş-çıkış tarih doğrulama yardımcıları */

export function parseStayDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateStayDates(checkIn?: string | null, checkOut?: string | null):
  | { ok: true; checkIn: string | null; checkOut: string | null }
  | { ok: false; error: string } {
  const inVal = checkIn?.trim() || "";
  const outVal = checkOut?.trim() || "";

  if (!inVal && !outVal) {
    return { ok: true, checkIn: null, checkOut: null };
  }
  if (!inVal || !outVal) {
    return { ok: false, error: "Giriş ve çıkış tarihleri birlikte girilmelidir." };
  }

  const inDate = parseStayDate(inVal);
  const outDate = parseStayDate(outVal);
  if (!inDate || !outDate) {
    return { ok: false, error: "Geçersiz tarih formatı." };
  }
  if (outDate <= inDate) {
    return { ok: false, error: "Çıkış tarihi giriş tarihinden sonra olmalıdır." };
  }

  return { ok: true, checkIn: inVal, checkOut: outVal };
}

/** [checkIn, checkOut) aralıkları çakışır mı? */
export function stayRangesOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string,
): boolean {
  const a0 = parseStayDate(aIn);
  const a1 = parseStayDate(aOut);
  const b0 = parseStayDate(bIn);
  const b1 = parseStayDate(bOut);
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0 < b1 && b0 < a1;
}

/** Onaylı rezervasyon için envanter günlerini listeler (checkOut hariç) */
export function eachStayNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const start = parseStayDate(checkIn);
  const end = parseStayDate(checkOut);
  if (!start || !end || end <= start) return nights;

  const cur = new Date(start);
  while (cur < end) {
    nights.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return nights;
}

export function validateLatLng(latitude?: string | null, longitude?: string | null):
  | { ok: true }
  | { ok: false; error: string } {
  const lat = latitude?.trim();
  const lng = longitude?.trim();
  if (!lat && !lng) return { ok: true };
  if (!lat || !lng) {
    return { ok: false, error: "Enlem ve boylam birlikte girilmelidir." };
  }
  const latN = Number(lat);
  const lngN = Number(lng);
  if (Number.isNaN(latN) || Number.isNaN(lngN)) {
    return { ok: false, error: "Geçersiz koordinat." };
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return { ok: false, error: "Koordinat aralığı geçersiz." };
  }
  return { ok: true };
}
