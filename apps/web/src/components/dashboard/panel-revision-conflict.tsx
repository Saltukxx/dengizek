"use client";

import { useCallback, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export interface RevisionConflictDetails {
  currentRevision: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function usePanelRevision() {
  const [revision, setRevision] = useState(1);
  const [conflict, setConflict] = useState<RevisionConflictDetails | null>(null);

  const consumeResponse = useCallback((json: {
    code?: string;
    revision?: number;
    currentRevision?: number;
    updatedAt?: string | null;
    updatedBy?: string | null;
  }): boolean => {
    if (json.code === "REVISION_CONFLICT" && typeof json.currentRevision === "number") {
      setConflict({
        currentRevision: json.currentRevision,
        updatedAt: json.updatedAt ?? null,
        updatedBy: json.updatedBy ?? null,
      });
      return true;
    }
    if (typeof json.revision === "number") setRevision(json.revision);
    return false;
  }, []);

  return {
    revision,
    setRevision,
    conflict,
    consumeResponse,
    keepLocalDraft: useCallback(() => setConflict(null), []),
    clearConflict: useCallback(() => setConflict(null), []),
  };
}

export function PanelRevisionConflictModal({
  conflict,
  onKeepLocal,
  onLoadLatest,
}: {
  conflict: RevisionConflictDetails | null;
  onKeepLocal: () => void;
  onLoadLatest: () => void | Promise<void>;
}) {
  return (
    <Modal opened={Boolean(conflict)} onClose={onKeepLocal} title="Düzenleme çakışması" centered>
      <Stack gap="md">
        <Text size="sm">
          Bu içerik siz düzenlerken başka bir kullanıcı tarafından güncellendi. Yerel
          taslağınız silinmedi.
        </Text>
        {conflict?.updatedAt && (
          <Text size="xs" c="dimmed">
            Son güncelleme: {new Date(conflict.updatedAt).toLocaleString("tr-TR")}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Güncel veriyi yüklemek yerel form değişikliklerini kaldırır. Yerel taslağı
          korursanız form açık kalır ancak güncel veriyi yüklemeden üzerine yazılmaz.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onKeepLocal}>Yerel taslağı koru</Button>
          <Button onClick={() => void onLoadLatest()}>Güncel veriyi yükle</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
