"use client";

// ---------------------------------------------------------------------------
// Admin talep listesi — filtre, sayfalama, detay drawer, mesaj, CSV
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
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
import { IconDownload, IconMessage } from "@tabler/icons-react";
import { inquirySourceLabels, inquiryStatusColors, inquiryStatusLabels } from "@/lib/labels";

interface AdminInquiry {
  id: string;
  hotelId: string | null;
  hotelSlug: string | null;
  hotelName: string | null;
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
  locale: string | null;
  marketingConsent: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  senderRole: string;
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface HotelOption {
  id: string;
  name: string;
  slug: string;
}

export function InquiriesTable() {
  const [inquiries, setInquiries] = useState<AdminInquiry[] | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [durum, setDurum] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [kaynak, setKaynak] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminInquiry | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ sayfa: String(sayfa) });
    if (durum) params.set("durum", durum);
    if (hotelId) params.set("hotelId", hotelId);
    if (kaynak) params.set("kaynak", kaynak);
    const res = await fetch(`/api/admin/inquiries?${params}`);
    const json = await res.json();
    if (json.ok) {
      setInquiries(json.inquiries);
      setHotels(json.hotels ?? []);
    }
  }, [durum, hotelId, kaynak, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openThread(id: string) {
    setThreadId(id);
    const row = inquiries?.find((q) => q.id === id) ?? null;
    setDetail(row);
    const res = await fetch(`/api/admin/inquiries/${id}/messages`);
    const json = await res.json();
    if (json.ok) {
      setDetail(json.inquiry);
      setMessages(json.messages);
    }
  }

  async function sendReply() {
    if (!threadId || !reply.trim()) return;
    const res = await fetch(`/api/admin/inquiries/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    if ((await res.json()).ok) {
      setReply("");
      void openThread(threadId);
    }
  }

  if (!inquiries) return <Loader />;

  async function setStatus(id: string, yeniDurum: AdminInquiry["status"]) {
    const res = await fetch(`/api/admin/inquiries/${id}`, {
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

  const exportParams = new URLSearchParams();
  if (durum) exportParams.set("durum", durum);
  if (hotelId) exportParams.set("hotelId", hotelId);
  if (kaynak) exportParams.set("kaynak", kaynak);
  const exportUrl = `/api/admin/inquiries/export?${exportParams}`;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group>
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
          <Select
            placeholder="Kaynak"
            clearable
            data={Object.entries(inquirySourceLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={kaynak}
            onChange={(v) => {
              setSayfa(1);
              setKaynak(v);
            }}
            w={160}
          />
          <Select
            placeholder="Durum"
            clearable
            data={Object.entries(inquiryStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={durum}
            onChange={(v) => {
              setSayfa(1);
              setDurum(v);
            }}
            w={160}
          />
        </Group>
        <Button component="a" href={exportUrl} variant="light" leftSection={<IconDownload size={16} />}>
          CSV indir
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Tesis</Table.Th>
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
                <Table.Td colSpan={8}>
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
                <Table.Td>{q.hotelName ?? q.hotelSlug ?? "—"}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {q.checkIn ?? "—"} → {q.checkOut ?? "—"}
                  </Text>
                  {(q.adults != null || q.roomSlug) && (
                    <Text size="xs" c="dimmed">
                      {q.adults != null ? `${q.adults} yetişkin` : ""}
                      {q.children ? `, ${q.children} çocuk` : ""}
                      {q.roomSlug ? ` · ${q.roomSlug}` : ""}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">
                    {inquirySourceLabels[q.source]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={q.marketingConsent ? "green" : "gray"} variant="light" size="sm">
                    {q.marketingConsent ? "Evet" : "Hayır"}
                  </Badge>
                </Table.Td>
                <Table.Td maw={200}>
                  <Text size="sm" lineClamp={2}>
                    {q.message}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    data={Object.entries(inquiryStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
                    value={q.status}
                    onChange={(v) => v && setStatus(q.id, v as AdminInquiry["status"])}
                    w={130}
                  />
                </Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" leftSection={<IconMessage size={14} />} onClick={() => openThread(q.id)}>
                    Detay
                  </Button>
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
        <Button variant="default" disabled={inquiries.length < 50} onClick={() => setSayfa((p) => p + 1)}>
          Sonraki
        </Button>
      </Group>

      <Drawer opened={threadId !== null} onClose={() => setThreadId(null)} title={detail?.name ?? "Talep"} size="md">
        {detail && (
          <Stack gap="sm">
            <Badge color={inquiryStatusColors[detail.status]}>{inquiryStatusLabels[detail.status]}</Badge>
            <Text size="sm">{detail.message}</Text>
            {detail.tourId && (
              <Text size="xs" c="dimmed">
                Tur: {detail.tourId} {detail.stepKey ? `· ${detail.stepKey}` : ""}
              </Text>
            )}
            <Stack gap="xs">
              {messages.map((m) => (
                <Paper key={m.id} withBorder p="xs" radius="sm">
                  <Text size="xs" c="dimmed">
                    {m.senderName ?? m.senderRole} · {new Date(m.createdAt).toLocaleString("tr-TR")}
                  </Text>
                  <Text size="sm">{m.body}</Text>
                </Paper>
              ))}
            </Stack>
            <Textarea value={reply} onChange={(e) => setReply(e.currentTarget.value)} placeholder="Yanıt yazın…" minRows={3} />
            <Button onClick={sendReply}>Gönder</Button>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
