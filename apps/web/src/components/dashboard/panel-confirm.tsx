"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export type PanelConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
};

export function usePanelConfirm() {
  const [request, setRequest] = useState<PanelConfirmRequest | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: PanelConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest(opts);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }, []);

  const modal: ReactNode = (
    <Modal opened={request !== null} onClose={() => settle(false)} title={request?.title} centered>
      <Stack gap="md">
        <Text size="sm">{request?.message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => settle(false)}>
            Vazgeç
          </Button>
          <Button color={request?.confirmColor ?? "red"} onClick={() => settle(true)}>
            {request?.confirmLabel ?? "Onayla"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  return { confirm, modal };
}
