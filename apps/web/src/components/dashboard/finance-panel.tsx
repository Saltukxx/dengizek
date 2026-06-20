"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Loader, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { paymentStatusLabels } from "@/lib/labels";
import { formatPrice } from "@/lib/price";
import { useMyHotel } from "./use-my-hotel";

interface PaymentRow {
  id: string;
  bookingId: string | null;
  amountMinor: number;
  currency: string;
  platformFeeMinor: number;
  status: "beklemede" | "odendi" | "iade" | "basarisiz";
  provider: string | null;
  createdAt: string;
}

export function FinancePanel() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [totalMinor, setTotalMinor] = useState(0);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/finance`);
    const json = await res.json();
    if (json.ok) {
      setPayments(json.payments);
      setTotalMinor(json.totalMinor);
    }
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
  if (!payments) return <Loader />;

  return (
    <Stack gap="md">
      <Paper withBorder p="lg" radius="md">
        <Title order={4}>{formatPrice(totalMinor, "TRY")}</Title>
        <Text c="dimmed" size="sm">
          Toplam tahsil edilen (son 30 gün sınırı yok — tüm ödenenler)
        </Text>
      </Paper>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rezervasyon</Table.Th>
              <Table.Th>Tutar</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Sağlayıcı</Table.Th>
              <Table.Th>Tarih</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {payments.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" size="sm" py="sm">
                    Ödeme kaydı yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {payments.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  {p.bookingId ? (
                    <Text size="xs" ff="monospace">
                      {p.bookingId.slice(0, 8)}…
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td>{formatPrice(p.amountMinor, p.currency as "TRY")}</Table.Td>
                <Table.Td>
                  <Badge>{paymentStatusLabels[p.status]}</Badge>
                </Table.Td>
                <Table.Td>{p.provider ?? "—"}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(p.createdAt).toLocaleString("tr-TR")}
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
