"use client";

import { Button, Group, Text } from "@mantine/core";

export function ListPagination({
  sayfa,
  hasMore,
  totalCount,
  limit,
  onSayfaChange,
}: {
  sayfa: number;
  hasMore: boolean;
  totalCount: number;
  limit: number;
  onSayfaChange: (sayfa: number) => void;
}) {
  if (totalCount <= limit) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <Group justify="space-between" mt="sm">
      <Text size="sm" c="dimmed">
        {totalCount} kayıt · sayfa {sayfa}/{totalPages}
      </Text>
      <Group gap="xs">
        <Button
          size="xs"
          variant="default"
          disabled={sayfa <= 1}
          onClick={() => onSayfaChange(sayfa - 1)}
        >
          Önceki
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={!hasMore}
          onClick={() => onSayfaChange(sayfa + 1)}
        >
          Sonraki
        </Button>
      </Group>
    </Group>
  );
}
