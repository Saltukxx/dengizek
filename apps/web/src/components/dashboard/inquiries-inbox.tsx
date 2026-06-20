"use client";

// ---------------------------------------------------------------------------
// Talep gelen kutusu — otelin misafir talepleri + durum işaretleme
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
import { IconAlertCircle } from "@tabler/icons-react";
import { inquiryStatusColors, inquiryStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "yeni" | "ilgileniliyor" | "kapatildi";
  createdAt: string;
}

export function InquiriesInbox() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [inquiries, setInquiries] = useState<InquiryRow[] | null>(null);
  const [durum, setDurum] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = new URLSearchParams({ hotelId: hotel.id });
    if (durum) params.set("durum", durum);
    const res = await fetch(`/api/manager/inquiries?${params}`);
    const json = await res.json();
    if (json.ok) setInquiries(json.inquiries);
  }, [hotel, durum]);

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

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Select
          placeholder="Duruma göre filtrele"
          clearable
          data={[
            { value: "yeni", label: inquiryStatusLabels.yeni },
            { value: "ilgileniliyor", label: inquiryStatusLabels.ilgileniliyor },
            { value: "kapatildi", label: inquiryStatusLabels.kapatildi },
          ]}
          value={durum}
          onChange={setDurum}
        />
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Tarih</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {inquiries.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
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
                <Table.Td maw={320}>
                  <Text size="sm" lineClamp={3}>
                    {q.message}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={inquiryStatusColors[q.status]}>
                    {inquiryStatusLabels[q.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(q.createdAt).toLocaleString("tr-TR")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    {q.status === "yeni" && (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setStatus(q.id, "ilgileniliyor")}
                      >
                        İlgileniliyor
                      </Button>
                    )}
                    {q.status !== "kapatildi" && (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => setStatus(q.id, "kapatildi")}
                      >
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
    </Stack>
  );
}
