"use client";
import { useCallback, useState } from "react";
import { notifications } from "@mantine/notifications";
import { ApiClientError } from "@/lib/api-client";

export function useApiMutation() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, operation: () => Promise<T>, success?: string) => {
    if (busyKey) return undefined;
    setBusyKey(key);
    try {
      const result = await operation();
      if (success) notifications.show({ color: "green", message: success });
      return result;
    } catch (err) {
      notifications.show({ color: "red", message: err instanceof ApiClientError ? err.message : "İşlem başarısız oldu." });
      return undefined;
    } finally { setBusyKey(null); }
  }, [busyKey]);
  return { run, busyKey };
}
