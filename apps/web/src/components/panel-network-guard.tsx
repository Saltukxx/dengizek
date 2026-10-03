"use client";

import { Button, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";

const PANEL_API = /^\/api\/(admin|manager)(\/|$)/;
const REQUEST_TIMEOUT_MS = 20_000;

function requestMeta(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl, window.location.origin);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const bodyKey = typeof init?.body === "string" ? init.body : "";
  return { path: url.pathname, method, key: `${method}:${url.href}:${bodyKey}` };
}

/**
 * Eski panel bileşenleri de dahil tüm /api/admin ve /api/manager çağrıları için
 * son güvenlik ağı: zaman aşımı, açıklanmış hata ve çift mutasyon koruması.
 */
export function PanelNetworkGuard() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const mutations = new Map<string, Promise<Response>>();

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const meta = requestMeta(input, init);
      if (!PANEL_API.test(meta.path)) return nativeFetch(input, init);

      const execute = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = new Promise<Response>((resolve) => {
            timer = setTimeout(
              () => resolve(new Response(JSON.stringify({ ok: false, error: "İstek zaman aşımına uğradı." }), {
                status: 504,
                headers: { "Content-Type": "application/json" },
              })),
              REQUEST_TIMEOUT_MS,
            );
          });
          const response = await Promise.race([nativeFetch(input, init), timeout]);
          if (!response.ok && (response.status === 401 || response.status >= 500)) {
            const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
            setError(
              response.status === 401
                ? "Oturumunuz sona erdi. Lütfen yeniden giriş yapın."
                : payload?.error ?? `İşlem tamamlanamadı (${response.status}).`,
            );
          }
          return response;
        } catch {
          setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
          return new Response(
            JSON.stringify({ ok: false, error: "Sunucuya ulaşılamadı. Lütfen tekrar deneyin." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      if (meta.method === "GET") return execute();
      const pending = mutations.get(meta.key);
      if (pending) return (await pending).clone();
      const mutation = execute();
      mutations.set(meta.key, mutation);
      try {
        return (await mutation).clone();
      } finally {
        mutations.delete(meta.key);
      }
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return (
    <Modal
      opened={Boolean(error)}
      onClose={() => setError(null)}
      title="İşlem tamamlanamadı"
      centered
      trapFocus
      returnFocus
    >
      <Stack>
        <Text size="sm">{error}</Text>
        <Button onClick={() => window.location.reload()}>Sayfayı yenileyip tekrar dene</Button>
      </Stack>
    </Modal>
  );
}
