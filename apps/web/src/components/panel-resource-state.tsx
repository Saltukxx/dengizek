"use client";

import { Alert, Button, Center, Loader, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

export function PanelLoading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <Center mih={160} role="status" aria-live="polite" aria-busy="true">
      <Stack align="center" gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">{label}</Text>
      </Stack>
    </Center>
  );
}

export function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={18} />} title="İşlem tamamlanamadı" role="alert">
      <Stack gap="sm">
        <Text size="sm">{message}</Text>
        {onRetry && (
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<IconRefresh size={16} />}
            onClick={onRetry}
            style={{ alignSelf: "flex-start", minHeight: 44 }}
          >
            Tekrar dene
          </Button>
        )}
      </Stack>
    </Alert>
  );
}

export function PanelEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Center mih={140} role="status">
      <Stack align="center" gap={4} ta="center">
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">{description}</Text>
      </Stack>
    </Center>
  );
}
