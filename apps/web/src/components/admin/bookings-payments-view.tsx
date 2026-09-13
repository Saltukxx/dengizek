"use client";

// ---------------------------------------------------------------------------
// Admin rezervasyon + ödeme görünürlüğü — platform genelinde, salt okunur
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { IconCalendarEvent, IconInfoCircle, IconReceipt2 } from "@tabler/icons-react";
import { bookingStatusLabels, paymentStatusLabels } from "@/lib/labels";
import { formatPrice } from "@/lib/price";
import { ListPagination } from "@/components/dashboard/list-pagination";
import { panelApi } from "@/lib/panel-api";
import type { RuntimeCapabilities } from "@/lib/runtime-capabilities";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";

interface HotelOption {
  id: string;
  name: string;
}

interface BookingRow {
  id: string;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  status: "beklemede" | "onaylandi" | "iptal" | "no_show";
  totalMinor: number | null;
  currency: string;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  bookingId: string | null;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  amountMinor: number;
  currency: string;
  platformFeeMinor: number;
  status: "beklemede" | "odendi" | "iade" | "basarisiz";
  provider: string | null;
  providerRef: string | null;
  createdAt: string;
}

function BookingsTab() {
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [durum, setDurum] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ sayfa: String(sayfa) });
    if (durum) params.set("durum", durum);
    if (hotelId) params.set("hotelId", hotelId);
    setError(null);
    try {
      const json = await panelApi<{
        bookings: BookingRow[];
        hotels?: HotelOption[];
        totalCount?: number;
        hasMore?: boolean;
      }>(`/api/admin/bookings?${params}`);
      setBookings(json.bookings);
      setHotels(json.hotels ?? []);
      setTotalCount(json.totalCount ?? 0);
      setHasMore(json.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rezervasyonlar yüklenemedi.");
    }
  }, [durum, hotelId, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSayfa(1);
  }, [durum, hotelId]);

  if (error) return <PanelError message={error} onRetry={() => void reload()} />;
  if (!bookings) return <PanelLoading label="Rezervasyonlar yükleniyor…" />;

  return (
    <Stack gap="md">
      <Group>
        <Select
          placeholder="Durum"
          clearable
          data={Object.entries(bookingStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={durum}
          onChange={setDurum}
          w={160}
        />
        <Select
          placeholder="Tesis"
          clearable
          searchable
          data={hotels.map((h) => ({ value: h.id, label: h.name }))}
          value={hotelId}
          onChange={setHotelId}
          w={200}
        />
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Tarihler</Table.Th>
              <Table.Th>Tutar</Table.Th>
              <Table.Th>Durum</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bookings.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <PanelEmpty title="Rezervasyon bulunamadı" description="Bu filtreyle eşleşen rezervasyon yok." />
                </Table.Td>
              </Table.Tr>
            )}
            {bookings.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>
                  <Text fw={500}>{b.guestName}</Text>
                  <Text size="xs" c="dimmed">
                    {b.guestEmail}
                    {b.guestPhone ? ` · ${b.guestPhone}` : ""}
                  </Text>
                </Table.Td>
                <Table.Td>{b.hotelName}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {b.checkIn} → {b.checkOut}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {b.adults} yetişkin{b.children ? `, ${b.children} çocuk` : ""}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {b.totalMinor != null ? formatPrice(b.totalMinor, b.currency, false) : "—"}
                </Table.Td>
                <Table.Td>
                  <Badge>{bookingStatusLabels[b.status]}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={50}
          onSayfaChange={setSayfa}
        />
      </Paper>
    </Stack>
  );
}

function PaymentsTab() {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [totalsByCurrency, setTotalsByCurrency] = useState<Record<string, number>>({});
  const [durum, setDurum] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ sayfa: String(sayfa) });
    if (durum) params.set("durum", durum);
    if (hotelId) params.set("hotelId", hotelId);
    setError(null);
    try {
      const capabilityJson = await panelApi<{ capabilities: RuntimeCapabilities }>(
        "/api/manager/capabilities",
      );
      setCapabilities(capabilityJson.capabilities);
      if (!capabilityJson.capabilities.payments) {
        setPayments([]);
        setTotalsByCurrency({});
        return;
      }
      const json = await panelApi<{
        payments: PaymentRow[];
        hotels?: HotelOption[];
        totalsByCurrency?: Record<string, number>;
        totalCount?: number;
        hasMore?: boolean;
      }>(`/api/admin/payments?${params}`);
      setPayments(json.payments);
      setHotels(json.hotels ?? []);
      setTotalsByCurrency(json.totalsByCurrency ?? {});
      setTotalCount(json.totalCount ?? 0);
      setHasMore(json.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ödeme kayıtları yüklenemedi.");
    }
  }, [durum, hotelId, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSayfa(1);
  }, [durum, hotelId]);

  if (error) return <PanelError message={error} onRetry={() => void reload()} />;
  if (!payments || !capabilities) return <PanelLoading label="Ödeme durumu yükleniyor…" />;

  if (!capabilities.payments) {
    return (
      <Alert color="blue" icon={<IconInfoCircle size={20} />} title="Ödeme altyapısı hazırlanıyor">
        Sağlayıcı etkinleştirilene kadar platform tahsilat raporu üretmez. Rezervasyonlar
        izlenmeye devam eder; bu alan hazır olduğunda gerçek ödeme kayıtlarını gösterecek.
      </Alert>
    );
  }

  const currencyEntries = Object.entries(totalsByCurrency);

  return (
    <Stack gap="md">
      {currencyEntries.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {currencyEntries.map(([currency, amount]) => (
            <Paper key={currency} withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Tahsil edilen ({currency})
              </Text>
              <Text fw={700} size="lg">
                {formatPrice(amount, currency, false)}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      <Group>
        <Select
          placeholder="Durum"
          clearable
          data={Object.entries(paymentStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={durum}
          onChange={setDurum}
          w={160}
        />
        <Select
          placeholder="Tesis"
          clearable
          searchable
          data={hotels.map((h) => ({ value: h.id, label: h.name }))}
          value={hotelId}
          onChange={setHotelId}
          w={200}
        />
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Tutar</Table.Th>
              <Table.Th>Platform payı</Table.Th>
              <Table.Th>Sağlayıcı</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Tarih</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {payments.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <PanelEmpty title="Ödeme kaydı bulunamadı" description="Bu filtreyle eşleşen gerçek tahsilat kaydı yok." />
                </Table.Td>
              </Table.Tr>
            )}
            {payments.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.hotelName}</Table.Td>
                <Table.Td>{formatPrice(p.amountMinor, p.currency, false)}</Table.Td>
                <Table.Td>{formatPrice(p.platformFeeMinor, p.currency, false)}</Table.Td>
                <Table.Td>
                  <Text size="sm">{p.provider ?? "—"}</Text>
                  {p.providerRef && (
                    <Text size="xs" c="dimmed">
                      {p.providerRef}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge>{paymentStatusLabels[p.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(p.createdAt).toLocaleString("tr-TR")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={50}
          onSayfaChange={setSayfa}
        />
      </Paper>
    </Stack>
  );
}

export function BookingsPaymentsView() {
  return (
    <Tabs defaultValue="bookings">
      <Tabs.List>
        <Tabs.Tab value="bookings" leftSection={<IconCalendarEvent size={16} />}>
          Rezervasyonlar
        </Tabs.Tab>
        <Tabs.Tab value="payments" leftSection={<IconReceipt2 size={16} />}>
          Ödemeler
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="bookings" pt="md">
        <BookingsTab />
      </Tabs.Panel>
      <Tabs.Panel value="payments" pt="md">
        <PaymentsTab />
      </Tabs.Panel>
    </Tabs>
  );
}
