"use client";

import { useCallback, useEffect, useState } from "react";
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
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconMessage, IconPlus } from "@tabler/icons-react";
import { reviewStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  guestName: string;
  status: "beklemede" | "yayinda" | "reddedildi";
  reply: string | null;
  createdAt: string;
}

export function ReviewsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [replyOpen, setReplyOpen] = useState<{ id: string; reply: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ guestName: "", rating: 5, title: "", body: "" });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/reviews`);
    const json = await res.json();
    if (json.ok) setReviews(json.reviews);
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
  if (!hotel || !reviews) return <Loader />;

  async function saveReply() {
    if (!replyOpen || !hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/reviews`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: replyOpen.id, reply: replyOpen.reply }),
    });
    if ((await res.json()).ok) {
      notifications.show({ color: "green", message: "Yanıt kaydedildi." });
      setReplyOpen(null);
      void reload();
    }
  }

  async function createReview() {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if ((await res.json()).ok) {
      notifications.show({ color: "green", message: "Yorum eklendi (moderasyon bekliyor)." });
      setCreateOpen(false);
      void reload();
    }
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Manuel yorum ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Puan</Table.Th>
              <Table.Th>Yorum</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reviews.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.guestName}</Table.Td>
                <Table.Td>{r.rating}/5</Table.Td>
                <Table.Td maw={280}>
                  <Text size="sm" fw={500}>
                    {r.title}
                  </Text>
                  <Text size="sm" lineClamp={2}>
                    {r.body}
                  </Text>
                  {r.reply && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Yanıt: {r.reply}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge>{reviewStatusLabels[r.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconMessage size={14} />}
                    onClick={() => setReplyOpen({ id: r.id, reply: r.reply ?? "" })}
                  >
                    Yanıtla
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={!!replyOpen} onClose={() => setReplyOpen(null)} title="Yanıt yaz">
        <Stack gap="sm">
          <Textarea
            label="Yanıt"
            minRows={3}
            value={replyOpen?.reply ?? ""}
            onChange={(e) =>
              replyOpen && setReplyOpen({ ...replyOpen, reply: e.currentTarget.value })
            }
          />
          <Button onClick={saveReply}>Kaydet</Button>
        </Stack>
      </Modal>
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Manuel yorum">
        <Stack gap="sm">
          <TextInput label="Misafir adı" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.currentTarget.value })} />
          <TextInput label="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          <Textarea label="Yorum" value={form.body} onChange={(e) => setForm({ ...form, body: e.currentTarget.value })} />
          <Button onClick={createReview}>Ekle</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
