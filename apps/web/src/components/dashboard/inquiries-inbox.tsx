"use client";

// ---------------------------------------------------------------------------
// Talep gelen kutusu — zengin alanlar, kaynak filtresi, mesaj drawer, CSV
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconDownload, IconMessage } from "@tabler/icons-react";
import { inquirySourceLabels, inquiryStatusColors, inquiryStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "yeni" | "ilgileniliyor" | "kapatildi";
  source: "web" | "tour_ai" | "tour_player";
  checkIn: string | null;
  checkOut: string | null;
  adults: number | null;
  children: number | null;
  roomSlug: string | null;
  tourId: string | null;
  stepKey: string | null;
  marketingConsent: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string | null;
  body: string;
  createdAt: string;
}

export function InquiriesInbox() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [inquiries, setInquiries] = useState<InquiryRow[] | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const [kaynak, setKaynak] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = new URLSearchParams({ hotelId: hotel.id });
    if (durum) params.set("durum", durum);
    if (kaynak) params.set("kaynak", kaynak);
    const res = await fetch(`/api/manager/inquiries?${params}`);
    const json = await res.json();
    if (json.ok) setInquiries(json.inquiries);
  }, [hotel, durum, kaynak]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openThread(id: string) {
    setThreadId(id);
    const res = await fetch(`/api/manager/inquiries/${id}/messages`);
    const json = await res.json();
    if (json.ok) setMessages(json.messages);
  }

  async function sendReply() {
    if (!threadId || !reply.trim()) return;
    const res = await fetch(`/api/manager/inquiries/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const json = await res.json();
    if (json.ok) {
      setReply("");
      void openThread(threadId);
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderilemedi." });
    }
  }

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!inquiries) return <Loader />;

  async function setStatus(id: string, yeniDurum: InquiryRow["status"]) {
    const res = await fetch(`/api/manager/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum: yeniDurum }),
    });
    const json = await res.json();
    if (json.ok) {
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Güncelleme başarısız oldu." });
    }
  }

  const exportUrl = hotel
    ? `/api/manager/inquiries/export?hotelId=${hotel.id}${durum ? `&durum=${durum}` : ""}${kaynak ? `&kaynak=${kaynak}` : ""}`
    : "#";

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Select
            placeholder="Durum"
            clearable
            data={Object.entries(inquiryStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={durum}
            onChange={setDurum}
          />
          <Select
            placeholder="Kaynak"
            clearable
            data={Object.entries(inquirySourceLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={kaynak}
            onChange={setKaynak}
          />
        </Group>
        {hotel && (
          <Button
            component="a"
            href={exportUrl}
            variant="light"
            leftSection={<IconDownload size={16} />}
          >
            CSV indir
          </Button>
        )}
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Konaklama</Table.Th>
              <Table.Th>Kaynak</Table.Th>
              <Table.Th>Pazarlama</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {inquiries.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" size="sm" py="sm">
                    Talep bulunamadı.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {inquiries.map((q) => (
              <Table.Tr key={q.id}>
                <Table.Td>
                  <Text fw={500}>{q.name}</Text>
                  <Text size="xs" c="dimmed">
                    {q.email}
                    {q.phone ? ` — ${q.phone}` : ""}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {q.checkIn || q.checkOut ? (
                    <Text size="sm">
                      {q.checkIn ?? "—"} → {q.checkOut ?? "—"}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                  {(q.adults != null || q.roomSlug) && (
                    <Text size="xs" c="dimmed">
                      {q.adults != null ? `${q.adults} yetişkin` : ""}
                      {q.children ? `, ${q.children} çocuk` : ""}
                      {q.roomSlug ? ` · ${q.roomSlug}` : ""}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{inquirySourceLabels[q.source]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={q.marketingConsent ? "green" : "gray"} variant="light">
                    {q.marketingConsent ? "Evet" : "Hayır"}
                  </Badge>
                </Table.Td>
                <Table.Td maw={240}>
                  <Text size="sm" lineClamp={2}>
                    {q.message}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={inquiryStatusColors[q.status]}>
                    {inquiryStatusLabels[q.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconMessage size={14} />}
                      onClick={() => openThread(q.id)}
                    >
                      Mesajlar
                    </Button>
                    {q.status === "yeni" && (
                      <Button size="xs" variant="light" onClick={() => setStatus(q.id, "ilgileniliyor")}>
                        İlgileniliyor
                      </Button>
                    )}
                    {q.status !== "kapatildi" && (
                      <Button size="xs" variant="default" onClick={() => setStatus(q.id, "kapatildi")}>
                        Kapat
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Drawer
        opened={!!threadId}
        onClose={() => setThreadId(null)}
        title="Mesaj thread'i"
        position="right"
        size="md"
      >
        <Stack gap="sm">
          {messages.map((m) => (
            <Paper key={m.id} p="sm" radius="md" bg={m.senderRole === "hotel" ? "indigo.0" : "gray.0"}>
              <Text size="xs" c="dimmed">
                {m.senderRole === "guest" ? "Misafir" : m.senderName ?? "Tesis"} —{" "}
                {new Date(m.createdAt).toLocaleString("tr-TR")}
              </Text>
              <Text size="sm">{m.body}</Text>
            </Paper>
          ))}
          <Textarea label="Yanıt" minRows={3} value={reply} onChange={(e) => setReply(e.currentTarget.value)} />
          <Button onClick={sendReply}>Gönder</Button>
        </Stack>
      </Drawer>
    </Stack>
  );
}
