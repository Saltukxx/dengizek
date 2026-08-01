"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
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
  roomId: string | null;
  exportUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

interface RoomOption {
  id: string;
  name: string;
}

export function ConnectivityPanel() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; importUrl: string; roomId: string | null }>({
    name: "",
    importUrl: "",
    roomId: null,
  });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const [feedRes, roomRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotel.id}/ical-feeds`),
      fetch(`/api/manager/hotels/${hotel.id}/rooms`),
    ]);
    const feedJson = await feedRes.json();
    const roomJson = await roomRes.json();
    if (feedJson.ok) setFeeds(feedJson.feeds);
    if (roomJson.ok) setRooms(roomJson.rooms.map((r: RoomOption) => ({ id: r.id, name: r.name })));
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
        roomId: form.roomId,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "iCal feed oluşturuldu." });
      setOpen(false);
      setForm({ name: "", importUrl: "", roomId: null });
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
        Kanal yöneticisi entegrasyonu. <strong>Dışa aktarma</strong> bağlantısını diğer platforma
        verin; <strong>içe aktarma</strong> URL&apos;si girerseniz o takvimdeki doluluk yarım
        saatte bir seçtiğiniz odanın müsaitliğine &quot;satışa kapalı&quot; olarak işlenir. Elle
        düzenlediğiniz günler korunur.
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
              <Table.Th>Hedef oda</Table.Th>
              <Table.Th>Dışa aktarma</Table.Th>
              <Table.Th>Son senkron</Table.Th>
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
                  {/* İçe aktarma var ama oda yoksa senkron atlanır — uyar. */}
                  {f.roomId ? (
                    <Text size="xs">{rooms.find((r) => r.id === f.roomId)?.name ?? "—"}</Text>
                  ) : f.importUrl ? (
                    <Badge size="sm" color="orange" variant="light">
                      Oda seçilmedi
                    </Badge>
                  ) : (
                    "—"
                  )}
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
                  {f.lastSyncAt ? (
                    <Stack gap={2}>
                      <Text size="xs">
                        {new Date(f.lastSyncAt).toLocaleString("tr-TR")}
                      </Text>
                      {f.lastSyncError && (
                        <Text size="xs" c="red" lineClamp={2}>
                          {f.lastSyncError}
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    "—"
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
          <Select
            label="Hedef oda"
            description="İçe aktarılan doluluk bu odanın müsaitliğine işlenir."
            placeholder="Oda seçin"
            data={rooms.map((r) => ({ value: r.id, label: r.name }))}
            value={form.roomId}
            onChange={(value) => setForm({ ...form, roomId: value })}
            clearable
          />
          <Button
            onClick={createFeed}
            disabled={form.name.trim().length === 0 || (form.importUrl.trim().length > 0 && !form.roomId)}
          >
            Oluştur
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
