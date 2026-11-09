import { NextResponse } from "next/server";

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function apiFail(
  error: string,
  status = 400,
  extra?: { issues?: unknown; code?: string },
) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function apiRateLimited(message = "Çok fazla istek gönderdiniz, lütfen biraz bekleyin.") {
  return apiFail(message, 429, { code: "rate_limited" });
}

export function apiNotFound(message = "Kayıt bulunamadı.") {
  return apiFail(message, 404, { code: "not_found" });
}

export function apiUnauthorized(message = "Oturum açmanız gerekiyor.") {
  return apiFail(message, 401, { code: "unauthorized" });
}

export function apiForbidden(message = "Bu işlem için yetkiniz yok.") {
  return apiFail(message, 403, { code: "forbidden" });
}

export function apiServiceUnavailable(message = "Hizmet geçici olarak kullanılamıyor.") {
  return apiFail(message, 503, { code: "service_unavailable" });
}

/**
 * Doğrulama hatası mesajı — ilk alan hatasını da söyler ("Doğrulama
 * başarısız: Şifre en az 8 karakter olmalı"). Paneller yalnız `error`
 * metnini gösterdiğinden aksi halde kullanıcı neyin yanlış olduğunu
 * bilemiyordu; ayrıntılı liste yine `issues` alanında döner.
 */
export function validationMessage(error: { issues: ReadonlyArray<{ message: string }> }): string {
  const first = error.issues[0]?.message;
  return first ? `Doğrulama başarısız: ${first}` : "Doğrulama başarısız";
}
