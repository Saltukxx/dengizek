"use client";

// ---------------------------------------------------------------------------
// Admin talep listesi — otel filtresi, zengin sütunlar
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
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

  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (durum) params.set("durum", durum);
    if (hotelId) params.set("hotelId", hotelId);
    if (kaynak) params.set("kaynak", kaynak);
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`/api/admin/inquiries${qs}`);
    const json = await res.json();
    if (json.ok) {
      setInquiries(json.inquiries);
      setHotels(json.hotels ?? []);
    }
  }, [durum, hotelId, kaynak]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Select
          placeholder="Tesis"
          clearable
          searchable
          data={hotels.map((h) => ({ value: h.id, label: h.name }))}
          value={hotelId}
          onChange={setHotelId}
          w={200}
        />
        <Select
          placeholder="Kaynak"
          clearable
          data={Object.entries(inquirySourceLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={kaynak}
          onChange={setKaynak}
          w={160}
        />
        <Select
          placeholder="Durum"
          clearable
          data={Object.entries(inquiryStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={durum}
          onChange={setDurum}
          w={160}
        />
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Konaklama</Table.Th>
              <Table.Th>Kaynak</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Tarih</Table.Th>
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
                <Table.Td>{q.hotelName ?? q.hotelSlug ?? "—"}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {q.checkIn ?? "—"} → {q.checkOut ?? "—"}
                  </Text>
                  {q.roomSlug && (
                    <Text size="xs" c="dimmed">
                      {q.roomSlug}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">
                    {inquirySourceLabels[q.source]}
                  </Badge>
                </Table.Td>
                <Table.Td maw={240}>
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
                    w={140}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(q.createdAt).toLocaleString("tr-TR")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
