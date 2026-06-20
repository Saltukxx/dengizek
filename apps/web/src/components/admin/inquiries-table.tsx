"use client";

// ---------------------------------------------------------------------------
// Admin talep listesi — tüm otellerin misafir talepleri
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
import { inquiryStatusColors, inquiryStatusLabels } from "@/lib/labels";

interface AdminInquiry {
  id: string;
  hotelSlug: string | null;
  hotelName: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "yeni" | "ilgileniliyor" | "kapatildi";
  createdAt: string;
}

export function InquiriesTable() {
  const [inquiries, setInquiries] = useState<AdminInquiry[] | null>(null);
  const [durum, setDurum] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const qs = durum ? `?durum=${durum}` : "";
    const res = await fetch(`/api/admin/inquiries${qs}`);
    const json = await res.json();
    if (json.ok) setInquiries(json.inquiries);
  }, [durum]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!inquiries) return <Loader />;

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
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Tarih</Table.Th>
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
                <Table.Td>{q.hotelName ?? q.hotelSlug ?? "—"}</Table.Td>
                <Table.Td maw={320}>
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
