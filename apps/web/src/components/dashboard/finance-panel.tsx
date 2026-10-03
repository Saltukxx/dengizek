"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Paper, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { paymentStatusLabels } from "@/lib/labels";
import { formatPrice } from "@/lib/price";
import { panelApi } from "@/lib/panel-api";
import type { RuntimeCapabilities } from "@/lib/runtime-capabilities";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";
import { ListPagination } from "./list-pagination";

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
  const { hotel, loading: hotelLoading, error: hotelError, reload: reloadHotels } = useMyHotel();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalsByCurrency, setTotalsByCurrency] = useState<Record<string, number>>({});
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 50;

  const reload = useCallback(async () => {
    if (!hotel) return;
    setError(null);
    try {
      const capabilityResponse = await panelApi<{ capabilities: RuntimeCapabilities }>(
        "/api/manager/capabilities",
      );
      setCapabilities(capabilityResponse.capabilities);
      if (!capabilityResponse.capabilities.payments) {
        setPayments([]);
        setTotalsByCurrency({});
        return;
      }
      const json = await panelApi<{
        payments: PaymentRow[];
        totalsByCurrency?: Record<string, number>;
        totalCount?: number;
        hasMore?: boolean;
      }>(`/api/manager/hotels/${hotel.id}/finance?sayfa=${sayfa}`);
      setPayments(json.payments);
      setTotalsByCurrency(json.totalsByCurrency ?? {});
      setTotalCount(json.totalCount ?? json.payments.length);
      setHasMore(json.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finans verileri yüklenemedi.");
    }
  }, [hotel, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) return <PanelError message={hotelError} onRetry={() => void reloadHotels()} />;
  if (error) return <PanelError message={error} onRetry={() => void reload()} />;
  if (!capabilities || !payments) return <PanelLoading label="Finans durumu yükleniyor…" />;

  if (!capabilities.payments) {
    return (
      <Alert color="blue" icon={<IconInfoCircle size={20} />} title="Ödeme altyapısı hazırlanıyor">
        Tahsilat ve finans raporları yakında kullanıma açılacak. Rezervasyon verileriniz
        etkilenmez; ödeme sağlayıcısı etkinleştirilene kadar burada gerçeği yansıtmayan ₺0
        raporu gösterilmez.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="lg" radius="md">
        <Title order={4}>
          {Object.entries(totalsByCurrency).length > 0
            ? Object.entries(totalsByCurrency).map(([currency, amount]) => formatPrice(amount, currency as "TRY")).join(" · ")
            : formatPrice(0, "TRY")}
        </Title>
        <Text c="dimmed" size="sm">
          Toplam tahsil edilen (son 30 gün sınırı yok — tüm ödenenler)
        </Text>
      </Paper>
      <Paper withBorder radius="md">
        <ScrollArea type="auto">
        <Table highlightOnHover miw={680}>
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
                  <PanelEmpty title="Ödeme kaydı yok" description="Seçili tesis için henüz tahsilat kaydı oluşmadı." />
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
        </ScrollArea>
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={limit}
          onSayfaChange={setSayfa}
        />
      </Paper>
    </Stack>
  );
}
