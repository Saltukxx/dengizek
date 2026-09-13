export class PanelApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public issues?: unknown,
  ) {
    super(message);
    this.name = "PanelApiError";
  }
}

export async function panelApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new PanelApiError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.", 0);
  }

  const json = (await response.json().catch(() => null)) as
    | (T & { ok?: boolean; error?: string; code?: string; issues?: unknown })
    | null;

  if (!response.ok || !json || json.ok === false) {
    if (response.status === 401) {
      throw new PanelApiError("Oturumunuz sona erdi. Lütfen yeniden giriş yapın.", 401, "unauthorized");
    }
    if (response.status === 409) {
      throw new PanelApiError(
        json?.error ?? "Kayıt başka bir kullanıcı tarafından değiştirildi. Veriyi yenileyin.",
        409,
        json?.code ?? "conflict",
        json?.issues,
      );
    }
    throw new PanelApiError(
      json?.error ?? `İşlem tamamlanamadı (${response.status}).`,
      response.status,
      json?.code,
      json?.issues,
    );
  }

  return json;
}
