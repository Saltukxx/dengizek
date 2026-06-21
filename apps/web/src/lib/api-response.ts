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
