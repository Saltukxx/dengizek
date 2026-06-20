"use client";

// ---------------------------------------------------------------------------
// Tur listesi — durum rozetleri, yeni tur oluşturma, incelemeye gönderme
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconExternalLink, IconPencil, IconPlus, IconSend, IconTrash } from "@tabler/icons-react";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface TourRow {
  id: string;
  tourId: string;
  title: string;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  version: number;
  publishedAt: string | null;
}

export function ToursList() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [tours, setTours] = useState<TourRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTourId, setNewTourId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours`);
    const json = await res.json();
    if (json.ok) setTours(json.tours);
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
  if (!hotel || !tours) return <Loader />;

  async function createTour() {
    if (!hotel) return;
    setBusy(true);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourId: newTourId, title: newTitle }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Tur oluşturuldu." });
      setCreateOpen(false);
      setNewTourId("");
      setNewTitle("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Tur oluşturulamadı." });
    }
  }

  async function submitTour(tourId: string) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours/${tourId}/submit`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "blue", message: "Tur incelemeye gönderildi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderme başarısız oldu." });
    }
  }

  async function deleteTour(tourId: string, title: string) {
    if (!hotel) return;
    if (!confirm(`"${title}" turunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours/${tourId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Tur silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {hotel.name} — {tours.length} tur
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Yeni tur
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tur</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Sürüm</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tours.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz tur yok. &quot;Yeni tur&quot; ile başlayın.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {tours.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>
                  <Text fw={500}>{t.title}</Text>
                  <Text size="xs" c="dimmed">
                    {t.tourId}
                  </Text>
                  {t.status === "reddedildi" && t.moderationNote && (
                    <Text size="xs" c="red">
                      Red nedeni: {t.moderationNote}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={moderationStatusColors[t.status]}>
                    {moderationStatusLabels[t.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>v{t.version}</Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    {(t.status === "taslak" || t.status === "reddedildi") && (
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconSend size={14} />}
                        onClick={() => submitTour(t.tourId)}
                      >
                        İncelemeye gönder
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="default"
                      component={Link}
                      href={`/dashboard/tours/${t.tourId}/edit`}
                      leftSection={<IconPencil size={14} />}
                    >
                      Düzenle
                    </Button>
                    {t.status !== "yayinda" && (
                      <Button
                        size="xs"
                        variant="subtle"
                        component={Link}
                        href={`/dashboard/tours/${t.tourId}/preview`}
                        target="_blank"
                        leftSection={<IconExternalLink size={14} />}
                      >
                        Taslak önizle
                      </Button>
                    )}
                    {t.status === "yayinda" && hotel && (
                      <Button
                        size="xs"
                        variant="subtle"
                        component={Link}
                        href={`/tours/${hotel.slug}/${t.tourId}`}
                        target="_blank"
                        leftSection={<IconExternalLink size={14} />}
                      >
                        Önizle
                      </Button>
                    )}
                    {hotel?.memberRole === "owner" &&
                      (t.status === "taslak" || t.status === "reddedildi") && (
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => deleteTour(t.tourId, t.title)}
                        >
                          Sil
                        </Button>
                      )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni tur oluştur">
        <Stack gap="sm">
          <TextInput
            label="Tur başlığı"
            placeholder="Örn. Ana tanıtım turu"
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
          />
          <TextInput
            label="Tur kimliği"
            description="URL'de görünür — küçük harf, rakam ve tire (örn. ana-tur)"
            placeholder="ana-tur"
            value={newTourId}
            onChange={(e) => setNewTourId(e.currentTarget.value)}
          />
          <Button loading={busy} onClick={createTour}>
            Oluştur
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
