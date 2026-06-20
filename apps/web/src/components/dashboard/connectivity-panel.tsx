"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface FeedRow {
  id: string;
  name: string;
  importUrl: string | null;
  exportUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export function ConnectivityPanel() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", importUrl: "" });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/ical-feeds`);
    const json = await res.json();
    if (json.ok) setFeeds(json.feeds);
  }, [hotel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!hotel || !feeds) return <Loader />;

  async function createFeed() {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/ical-feeds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        importUrl: form.importUrl || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "iCal feed oluşturuldu." });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Oluşturulamadı." });
    }
  }

  async function removeFeed(id: string) {
    if (!hotel) return;
    await fetch(`/api/manager/hotels/${hotel.id}/ical-feeds`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void reload();
  }

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Kanal yöneticisi entegrasyonu için iCal dışa aktarma bağlantıları oluşturun.
      </Text>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          Feed ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>İçe aktarma URL</Table.Th>
              <Table.Th>Dışa aktarma</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {feeds.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>{f.name}</Table.Td>
                <Table.Td>
                  <Text size="xs" lineClamp={1} maw={200}>
                    {f.importUrl ?? "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {f.exportUrl && (
                    <CopyButton value={f.exportUrl}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Kopyalandı" : "Kopyala"}>
                          <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={copy}>
                            {copied ? "Kopyalandı" : "URL"}
                          </Button>
                        </Tooltip>
                      )}
                    </CopyButton>
                  )}
                </Table.Td>
                <Table.Td>
                  <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => removeFeed(f.id)}>
                    Sil
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="iCal feed">
        <Stack gap="sm">
          <TextInput label="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <TextInput label="İçe aktarma URL (opsiyonel)" value={form.importUrl} onChange={(e) => setForm({ ...form, importUrl: e.currentTarget.value })} />
          <Button onClick={createFeed}>Oluştur</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
