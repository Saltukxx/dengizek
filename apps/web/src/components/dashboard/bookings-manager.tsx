"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconSearch, IconWallet } from "@tabler/icons-react";
import { STAY_STATES, stayState, stayStateColors, stayStateLabels } from "@/lib/booking-stay";
import { formatPrice, todayIso } from "@/lib/price";
import { BookingsCalendar } from "./bookings-calendar";
import { useMyHotel } from "./use-my-hotel";
import { ListPagination } from "./list-pagination";
import { newIdempotencyKey } from "@/lib/api-client";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";

interface BookingRow {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  status: "beklemede" | "onaylandi" | "iptal" | "no_show";
  totalMinor: number | null;
  currency: string;
  notes: string | null;
  roomId: string | null;
  ratePlanId: string | null;
  inquiryId: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

type BookingAction =
  | "approve"
  | "cancel"
  | "mark_no_show"
  | "reopen"
  | "check_in"
  | "check_out"
  | "undo_check_in"
  | "undo_check_out";

const ACTION_DONE: Record<BookingAction, string> = {
  approve: "Rezervasyon onaylandı.",
  cancel: "Rezervasyon iptal edildi.",
  mark_no_show: "Rezervasyon gelmedi olarak işaretlendi.",
  reopen: "Rezervasyon yeniden açıldı.",
  check_in: "Giriş kaydedildi.",
  check_out: "Çıkış kaydedildi.",
  undo_check_in: "Giriş kaydı geri alındı.",
  undo_check_out: "Çıkış kaydı geri alındı.",
};

interface RoomOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
}

export function BookingsManager() {
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [durum, setDurum] = useState<string | null>(null);
  const [view, setView] = useState<"liste" | "takvim">("liste");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // Takvim, listede yapılan değişiklikten sonra yeniden okunur.
  const [calendarKey, setCalendarKey] = useState(0);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [limit] = useState(50);
  const [detail, setDetail] = useState<BookingRow | null>(null);

  useEffect(() => {
    void fetch("/api/manager/capabilities")
      .then((response) => response.json())
      .then((json) => setPaymentsEnabled(Boolean(json.capabilities?.payments)))
      .catch(() => setPaymentsEnabled(false));
  }, []);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = new URLSearchParams();
    if (durum) params.set("durum", durum);
    if (q) params.set("q", q);
    if (fromDate) params.set("baslangic", fromDate);
    if (toDate) params.set("bitis", toDate);
    params.set("sayfa", String(sayfa));
    const qs = params.toString();
    const [bookingsRes, roomsRes, plansRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotel.id}/bookings?${qs}`),
      fetch(`/api/manager/hotels/${hotel.id}/rooms`),
      fetch(`/api/manager/hotels/${hotel.id}/rate-plans`),
    ]);
    const bookingsJson = await bookingsRes.json();
    const roomsJson = await roomsRes.json();
    const plansJson = await plansRes.json();
    if (bookingsJson.ok) {
      setLoadError(null);
      setBookings(bookingsJson.bookings);
      setTotalCount(bookingsJson.totalCount ?? bookingsJson.bookings.length);
      setHasMore(bookingsJson.hasMore ?? false);
    } else {
      setLoadError(bookingsJson.error ?? "Rezervasyonlar alınamadı.");
      setBookings([]);
    }
    if (roomsJson.ok) {
      setRooms(
        (roomsJson.rooms as { id: string; name: string }[]).map((r) => ({
          id: r.id,
          name: r.name,
        })),
      );
    }
    if (plansJson.ok) {
      setPlans(
        (plansJson.plans as { id: string; name: string }[]).map((p) => ({
          id: p.id,
          name: p.name,
        })),
      );
    }
  }, [hotel, durum, q, fromDate, toDate, sayfa]);

  useEffect(() => {
    setSayfa(1);
  }, [durum, q, fromDate, toDate]);

  // Arama her tuşta değil, yazma durunca gider.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) {
    return <PanelError message={hotelError} />;
  }
  if (loadError) {
    return <PanelError message={loadError} onRetry={() => void reload()} />;
  }
  if (!hotel || !bookings) return <PanelLoading />;

  const roomName = (id: string | null) =>
    id ? (rooms.find((r) => r.id === id)?.name ?? "—") : "—";

  async function runAction(id: string, action: BookingAction) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, idempotencyKey: newIdempotencyKey(action, id) }),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      await reload();
      setCalendarKey((key) => key + 1);
      if (detail?.id === id) setDetail((d) => (d ? { ...d, ...(json.booking as BookingRow) } : d));
      notifications.show({ color: "green", message: ACTION_DONE[action] });
    } else {
      notifications.show({ color: "red", message: json?.error ?? "Güncellenemedi." });
    }
  }

  const today = todayIso();
  const exportParams = new URLSearchParams();
  if (durum) exportParams.set("durum", durum);
  if (q) exportParams.set("q", q);
  if (fromDate) exportParams.set("baslangic", fromDate);
  if (toDate) exportParams.set("bitis", toDate);
  const hasFilters = Boolean(durum || q || fromDate || toDate);

  async function saveDetailNotes() {
    if (!hotel || !detail) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id, notes: detail.notes ?? "" }),
    });
    if ((await res.json()).ok) {
      notifications.show({ color: "green", message: "Notlar kaydedildi." });
      await reload();
      setCalendarKey((key) => key + 1);
    }
  }

  async function startPayment(booking: BookingRow) {
    if (!hotel || booking.totalMinor == null) {
      notifications.show({ color: "yellow", message: "Tahsilat için toplam tutar gerekli." });
      return;
    }
    // Tutar sunucuda rezervasyon kaydından belirlenir — istemci göndermez.
    const res = await fetch(`/api/manager/hotels/${hotel.id}/payments/create-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Ödeme niyeti oluşturuldu." });
    } else {
      notifications.show({ color: "red", message: json.error ?? "Tahsilat başlatılamadı." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as "liste" | "takvim")}
          data={[
            { value: "liste", label: "Liste" },
            { value: "takvim", label: "Takvim" },
          ]}
        />
        <Button component={Link} href="/dashboard/inquiries" variant="default">
          Taleplerden rezervasyon aç
        </Button>
      </Group>

      {view === "takvim" && (
        <BookingsCalendar<BookingRow> hotelId={hotel.id} reloadKey={calendarKey} onSelect={setDetail} />
      )}

      {view === "liste" && (
      <>
      <Group align="flex-end" wrap="wrap">
        <TextInput
          label="Ara"
          placeholder="Misafir adı"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: "1 1 240px" }}
        />
        <Select
          label="Durum"
          placeholder="Tümü"
          clearable
          data={STAY_STATES.map((value) => ({ value, label: stayStateLabels[value] }))}
          value={durum}
          onChange={setDurum}
          w={170}
        />
        <TextInput
          label="Konaklama başlangıcı"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.currentTarget.value)}
        />
        <TextInput
          label="Konaklama bitişi"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.currentTarget.value)}
        />
        <Button
          component="a"
          href={`/api/manager/hotels/${hotel.id}/bookings/export?${exportParams}`}
          variant="default"
          leftSection={<IconDownload size={16} />}
        >
          CSV indir
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <ScrollArea type="auto">
        <Table highlightOnHover miw={920}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Oda / Plan</Table.Th>
              <Table.Th>Tarihler</Table.Th>
              <Table.Th>Tutar</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bookings.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <PanelEmpty
                    title={hasFilters ? "Eşleşen rezervasyon yok" : "Rezervasyon yok"}
                    description={
                      hasFilters
                        ? "Arama veya süzgeçleri değiştirip yeniden deneyin."
                        : "Rezervasyonlar, Talepler sayfasında bir talebi rezervasyona dönüştürünce burada görünür."
                    }
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {bookings.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>
                  <Text fw={500}>{b.guestName}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{roomName(b.roomId)}</Text>
                  <Text size="xs" c="dimmed">
                    {plans.find((p) => p.id === b.ratePlanId)?.name ?? "—"}
                  </Text>
                </Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>
                  {b.checkIn} — {b.checkOut}
                  <Text size="xs" c="dimmed">
                    {b.adults} yetişkin, {b.children} çocuk
                  </Text>
                </Table.Td>
                <Table.Td>
                  {b.totalMinor != null
                    ? formatPrice(b.totalMinor, b.currency, false)
                    : "—"}
                </Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>
                  <Badge color={stayStateColors[stayState(b)]} variant="light">
                    {stayStateLabels[stayState(b)]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => setDetail(b)}>
                      Detay
                    </Button>
                    {b.status === "beklemede" && (
                      <>
                        <Button size="xs" onClick={() => runAction(b.id, "approve")}>
                          Onayla
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => runAction(b.id, "cancel")}
                        >
                          İptal
                        </Button>
                      </>
                    )}
                    {stayState(b) === "onaylandi" && b.checkIn <= today && (
                      <Button size="xs" color="teal" onClick={() => runAction(b.id, "check_in")}>
                        Girişi kaydet
                      </Button>
                    )}
                    {stayState(b) === "konakliyor" && (
                      <Button size="xs" color="teal" variant="light" onClick={() => runAction(b.id, "check_out")}>
                        Çıkışı kaydet
                      </Button>
                    )}
                    {b.status === "onaylandi" && b.totalMinor != null && (
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        leftSection={<IconWallet size={14} />}
                        disabled={!paymentsEnabled}
                        onClick={() => startPayment(b)}
                      >
                        {paymentsEnabled ? "Tahsilat başlat" : "Tahsilat yakında"}
                      </Button>
                    )}
                  </Group>
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
      </>
      )}

      <Drawer
        opened={!!detail}
        onClose={() => setDetail(null)}
        title="Rezervasyon detayı"
        position="right"
        size="md"
      >
        {detail && (
          <Stack gap="sm">
            <Text fw={600}>{detail.guestName}</Text>
            <Text size="sm">
              {detail.checkIn} → {detail.checkOut}
            </Text>
            <Text size="sm">Oda: {roomName(detail.roomId)}</Text>
            <Text size="sm">
              Plan: {plans.find((p) => p.id === detail.ratePlanId)?.name ?? "—"}
            </Text>
            <Text size="sm">
              Tutar:{" "}
              {detail.totalMinor != null
                ? formatPrice(detail.totalMinor, detail.currency, false)
                : "—"}
            </Text>
            <Badge color={stayStateColors[stayState(detail)]} variant="light" style={{ alignSelf: "flex-start" }}>
              {stayStateLabels[stayState(detail)]}
            </Badge>
            {detail.checkedInAt && (
              <Text size="xs" c="dimmed">
                Giriş: {new Date(detail.checkedInAt).toLocaleString("tr-TR")}
                {detail.checkedOutAt
                  ? ` · Çıkış: ${new Date(detail.checkedOutAt).toLocaleString("tr-TR")}`
                  : ""}
              </Text>
            )}
            {detail.inquiryId && (
              <Button
                component={Link}
                href={`/dashboard/inquiries`}
                variant="light"
                size="xs"
              >
                Talep: {detail.inquiryId.slice(0, 8)}…
              </Button>
            )}
            <Textarea
              label="Notlar"
              minRows={3}
              value={detail.notes ?? ""}
              onChange={(e) => setDetail({ ...detail, notes: e.currentTarget.value })}
            />
            <Group>
              <Button size="sm" onClick={saveDetailNotes}>
                Notları kaydet
              </Button>
              {detail.status === "beklemede" && (
                <>
                  <Button size="sm" onClick={() => runAction(detail.id, "approve")}>
                    Onayla
                  </Button>
                  <Button
                    size="sm"
                    color="red"
                    variant="light"
                    onClick={() => runAction(detail.id, "cancel")}
                  >
                    İptal
                  </Button>
                </>
              )}
              {stayState(detail) === "onaylandi" && (
                <>
                  <Button
                    size="sm"
                    color="teal"
                    disabled={detail.checkIn > today}
                    title={detail.checkIn > today ? "Giriş tarihi henüz gelmedi" : undefined}
                    onClick={() => runAction(detail.id, "check_in")}
                  >
                    Girişi kaydet
                  </Button>
                  {detail.checkIn <= today && (
                    <Button
                      size="sm"
                      color="orange"
                      variant="light"
                      onClick={() => runAction(detail.id, "mark_no_show")}
                    >
                      Gelmedi
                    </Button>
                  )}
                  <Button
                    size="sm"
                    color="red"
                    variant="light"
                    onClick={() => runAction(detail.id, "cancel")}
                  >
                    İptal
                  </Button>
                </>
              )}
              {stayState(detail) === "konakliyor" && (
                <>
                  <Button size="sm" color="teal" onClick={() => runAction(detail.id, "check_out")}>
                    Çıkışı kaydet
                  </Button>
                  <Button size="sm" variant="subtle" onClick={() => runAction(detail.id, "undo_check_in")}>
                    Girişi geri al
                  </Button>
                </>
              )}
              {stayState(detail) === "cikis_yapti" && (
                <Button size="sm" variant="subtle" onClick={() => runAction(detail.id, "undo_check_out")}>
                  Çıkışı geri al
                </Button>
              )}
              {(detail.status === "iptal" || detail.status === "no_show") && (
                <Button size="sm" variant="light" onClick={() => runAction(detail.id, "reopen")}>
                  Yeniden aç
                </Button>
              )}
              {detail.status === "onaylandi" && detail.totalMinor != null && (
                <Button
                  size="sm"
                  color="teal"
                  leftSection={<IconWallet size={14} />}
                  disabled={!paymentsEnabled}
                  onClick={() => startPayment(detail)}
                >
                  {paymentsEnabled ? "Tahsilat başlat" : "Tahsilat yakında"}
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
