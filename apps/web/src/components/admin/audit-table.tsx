"use client";

// ---------------------------------------------------------------------------
// Denetim kaydı tablosu — admin işlemleri ve manager gönderi olayları
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";

interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

const entityTypeLabels: Record<string, string> = {
  hotel: "Otel",
  tour: "Tur",
  user: "Kullanıcı",
  media: "Medya",
  inquiry: "Talep",
};

export function AuditTable() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    params.set("sayfa", String(sayfa));
    const res = await fetch(`/api/admin/audit-log?${params}`);
    const json = await res.json();
    if (json.ok) {
      setEntries(json.entries);
      setHasMore(json.hasMore ?? false);
    }
  }, [entityType, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entries) return <Loader />;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Select
          placeholder="Varlık türüne göre filtrele"
          clearable
          data={Object.entries(entityTypeLabels).map(([value, label]) => ({ value, label }))}
          value={entityType}
          onChange={(v) => {
            setSayfa(1);
            setEntityType(v);
          }}
        />
        <Group gap="xs">
          <Button
            variant="default"
            size="xs"
            disabled={sayfa <= 1}
            onClick={() => setSayfa((s) => s - 1)}
          >
            Önceki
          </Button>
          <Text size="sm" c="dimmed">
            Sayfa {sayfa}
          </Text>
          <Button
            variant="default"
            size="xs"
            disabled={!hasMore}
            onClick={() => setSayfa((s) => s + 1)}
          >
            Sonraki
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Zaman</Table.Th>
              <Table.Th>Kullanıcı</Table.Th>
              <Table.Th>İşlem</Table.Th>
              <Table.Th>Varlık</Table.Th>
              <Table.Th>Ayrıntı</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" size="sm" py="sm">
                    Kayıt bulunamadı.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {entries.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(e.createdAt).toLocaleString("tr-TR")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{e.actorEmail ?? "—"}</Text>
                </Table.Td>
                <Table.Td>
                  <Code>{e.action}</Code>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {entityTypeLabels[e.entityType] ?? e.entityType}
                  </Badge>
                </Table.Td>
                <Table.Td maw={360}>
                  {e.meta ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {JSON.stringify(e.meta)}
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
