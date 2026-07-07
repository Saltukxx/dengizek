export class ApiClientError extends Error {
  constructor(public status: number, public code: string | undefined, message: string, public payload?: Record<string, unknown>) { super(message); }
}

export async function apiRequest<T extends Record<string, unknown>>(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: init.signal ?? controller.signal });
    const json = await res.json().catch(() => ({ ok: false, error: "Sunucudan geçersiz yanıt alındı." })) as Record<string, unknown>;
    if (!res.ok || json.ok === false) {
      const code = typeof json.code === "string" ? json.code : undefined;
      if (code === "SESSION_REVOKED" && typeof window !== "undefined") window.location.assign("/giris?reason=session-revoked");
      throw new ApiClientError(res.status, code, String(json.error ?? "İşlem başarısız oldu."), json);
    }
    return json as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiClientError(408, "TIMEOUT", "İstek zaman aşımına uğradı.");
    throw new ApiClientError(0, "NETWORK_ERROR", "Sunucuya ulaşılamadı.");
  } finally { clearTimeout(timer); }
}

export function newIdempotencyKey(action: string, id: string) {
  return `${action}:${id}:${crypto.randomUUID()}`;
}
