"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { reviewStatusLabels } from "@/lib/labels";

interface ReviewRow {
  id: string;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  rating: number;
  title: string | null;
  body: string;
  guestName: string;
  stayDate: string | null;
  status: "beklemede" | "yayinda" | "reddedildi";
  createdAt: string;
}

interface HotelOption {
  id: string;
  name: string;
}

export function ReviewsModerationQueue() {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [durum, setDurum] = useState<string | null>("beklemede");
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ sayfa: String(sayfa) });
    if (durum) params.set("durum", durum);
    if (hotelId) params.set("hotelId", hotelId);
    const res = await fetch(`/api/admin/reviews?${params}`);
    const json = await res.json();
    if (json.ok) {
      setReviews(json.reviews);
      setHotels(json.hotels ?? []);
    }
  }, [durum, hotelId, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!reviews) return <Loader />;

  async function decide(id: string, status: "yayinda" | "reddedildi") {
    setBusy(id);
    const res = await fetch(`/api/admin/reviews/${id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    setBusy(null);
    if (json.ok) {
      notifications.show({
        color: status === "yayinda" ? "green" : "orange",
        message: status === "yayinda" ? "Yorum yayına alındı." : "Yorum reddedildi.",
      });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız." });
    }
  }

  return (
    <Stack gap="md">
      <Group>
        <Select
          placeholder="Durum"
          clearable
          data={Object.entries(reviewStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={durum}
          onChange={(v) => {
            setSayfa(1);
            setDurum(v);
          }}
          w={160}
        />
        <Select
          placeholder="Tesis"
          clearable
          searchable
          data={hotels.map((h) => ({ value: h.id, label: h.name }))}
          value={hotelId}
          onChange={(v) => {
            setSayfa(1);
            setHotelId(v);
          }}
          w={200}
        />
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Puan</Table.Th>
              <Table.Th>Yorum</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reviews.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" size="sm" py="sm">
                    Yorum bulunamadı.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {reviews.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text fw={500}>{r.guestName}</Text>
                  <Text size="xs" c="dimmed">
                    {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                  </Text>
                </Table.Td>
                <Table.Td>{r.hotelName}</Table.Td>
                <Table.Td>{r.rating}/5</Table.Td>
                <Table.Td maw={280}>
                  {r.title && (
                    <Text fw={500} size="sm">
                      {r.title}
                    </Text>
                  )}
                  <Text size="sm" lineClamp={3}>
                    {r.body}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{reviewStatusLabels[r.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  {r.status === "beklemede" && (
                    <Group gap="xs" justify="flex-end">
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        leftSection={<IconCheck size={14} />}
                        loading={busy === r.id}
                        onClick={() => decide(r.id, "yayinda")}
                      >
                        Onayla
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        leftSection={<IconX size={14} />}
                        loading={busy === r.id}
                        onClick={() => decide(r.id, "reddedildi")}
                      >
                        Reddet
                      </Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Group justify="center">
        <Button variant="default" disabled={sayfa <= 1} onClick={() => setSayfa((p) => p - 1)}>
          Önceki
        </Button>
        <Text size="sm" c="dimmed">
          Sayfa {sayfa}
        </Text>
        <Button
          variant="default"
          disabled={reviews.length < 50}
          onClick={() => setSayfa((p) => p + 1)}
        >
          Sonraki
        </Button>
      </Group>
    </Stack>
  );
}
