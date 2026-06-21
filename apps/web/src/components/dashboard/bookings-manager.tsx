"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlus, IconWallet } from "@tabler/icons-react";
import { bookingStatusLabels } from "@/lib/labels";
import { formatPrice, toMinor } from "@/lib/price";
import { useMyHotel } from "./use-my-hotel";
import { ListPagination } from "./list-pagination";

interface BookingRow {
  id: string;
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
  notes: string | null;
  roomId: string | null;
  ratePlanId: string | null;
  inquiryId: string | null;
}

interface RoomOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
}

export function BookingsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [durum, setDurum] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [limit] = useState(50);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    checkIn: "",
    checkOut: "",
    adults: 2,
    children: 0,
    roomId: "" as string | null,
    ratePlanId: "" as string | null,
    totalMajor: null as number | null,
    notes: "",
  });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = new URLSearchParams();
    if (durum) params.set("durum", durum);
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
      setBookings(bookingsJson.bookings);
      setTotalCount(bookingsJson.totalCount ?? bookingsJson.bookings.length);
      setHasMore(bookingsJson.hasMore ?? false);
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
  }, [hotel, durum, sayfa]);

  useEffect(() => {
    setSayfa(1);
  }, [durum]);

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
  if (!hotel || !bookings) return <Loader />;

  const roomName = (id: string | null) =>
    id ? (rooms.find((r) => r.id === id)?.name ?? "—") : "—";

  async function createBooking() {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone || undefined,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        adults: form.adults,
        children: form.children,
        roomId: form.roomId || null,
        ratePlanId: form.ratePlanId || null,
        totalMinor: form.totalMajor != null ? toMinor(form.totalMajor) : null,
        notes: form.notes || undefined,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Rezervasyon oluşturuldu." });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Oluşturulamadı." });
    }
  }

  async function setStatus(id: string, status: BookingRow["status"]) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (json.ok) {
      void reload();
      if (detail?.id === id) setDetail((d) => (d ? { ...d, status } : d));
    } else {
      notifications.show({ color: "red", message: json.error ?? "Güncellenemedi." });
    }
  }

  async function saveDetailNotes() {
    if (!hotel || !detail) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id, notes: detail.notes ?? "" }),
    });
    if ((await res.json()).ok) {
      notifications.show({ color: "green", message: "Notlar kaydedildi." });
      void reload();
    }
  }

  async function startPayment(booking: BookingRow) {
    if (!hotel || booking.totalMinor == null) {
      notifications.show({ color: "yellow", message: "Tahsilat için toplam tutar gerekli." });
      return;
    }
    const res = await fetch(`/api/manager/hotels/${hotel.id}/payments/create-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: booking.id,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({
        color: "green",
        message: json.stub
          ? "Tahsilat kaydı oluşturuldu (test modu)."
          : "Ödeme niyeti oluşturuldu.",
      });
    } else {
      notifications.show({ color: "red", message: json.error ?? "Tahsilat başlatılamadı." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Select
          placeholder="Duruma göre filtrele"
          clearable
          data={Object.entries(bookingStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
          value={durum}
          onChange={setDurum}
        />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          Rezervasyon ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
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
                  <Text c="dimmed" size="sm" py="sm">
                    Rezervasyon yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {bookings.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>
                  <Text fw={500}>{b.guestName}</Text>
                  <Text size="xs" c="dimmed">
                    {b.guestEmail}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{roomName(b.roomId)}</Text>
                  <Text size="xs" c="dimmed">
                    {plans.find((p) => p.id === b.ratePlanId)?.name ?? "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
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
                <Table.Td>
                  <Badge>{bookingStatusLabels[b.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => setDetail(b)}>
                      Detay
                    </Button>
                    {b.status === "beklemede" && (
                      <>
                        <Button size="xs" onClick={() => setStatus(b.id, "onaylandi")}>
                          Onayla
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => setStatus(b.id, "iptal")}
                        >
                          İptal
                        </Button>
                      </>
                    )}
                    {b.status === "onaylandi" && b.totalMinor != null && (
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        leftSection={<IconWallet size={14} />}
                        onClick={() => startPayment(b)}
                      >
                        Tahsilat başlat
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={limit}
          onSayfaChange={setSayfa}
        />
      </Paper>

      <Modal opened={open} onClose={() => setOpen(false)} title="Yeni rezervasyon" size="md">
        <Stack gap="sm">
          <TextInput
            label="Misafir adı"
            value={form.guestName}
            onChange={(e) => setForm({ ...form, guestName: e.currentTarget.value })}
          />
          <TextInput
            label="E-posta"
            type="email"
            value={form.guestEmail}
            onChange={(e) => setForm({ ...form, guestEmail: e.currentTarget.value })}
          />
          <TextInput
            label="Telefon"
            value={form.guestPhone}
            onChange={(e) => setForm({ ...form, guestPhone: e.currentTarget.value })}
          />
          <Group grow>
            <TextInput
              label="Giriş"
              type="date"
              value={form.checkIn}
              onChange={(e) => setForm({ ...form, checkIn: e.currentTarget.value })}
            />
            <TextInput
              label="Çıkış"
              type="date"
              value={form.checkOut}
              onChange={(e) => setForm({ ...form, checkOut: e.currentTarget.value })}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Yetişkin"
              min={1}
              value={form.adults}
              onChange={(v) => setForm({ ...form, adults: Number(v) || 2 })}
            />
            <NumberInput
              label="Çocuk"
              min={0}
              value={form.children}
              onChange={(v) => setForm({ ...form, children: Number(v) || 0 })}
            />
          </Group>
          <Select
            label="Oda"
            placeholder="Seçin (opsiyonel)"
            clearable
            data={rooms.map((r) => ({ value: r.id, label: r.name }))}
            value={form.roomId}
            onChange={(v) => setForm({ ...form, roomId: v })}
          />
          <Select
            label="Fiyat planı"
            placeholder="Seçin (opsiyonel)"
            clearable
            data={plans.map((p) => ({ value: p.id, label: p.name }))}
            value={form.ratePlanId}
            onChange={(v) => setForm({ ...form, ratePlanId: v })}
          />
          <NumberInput
            label="Toplam tutar"
            min={0}
            decimalScale={2}
            value={form.totalMajor ?? ""}
            onChange={(v) =>
              setForm({ ...form, totalMajor: typeof v === "number" ? v : null })
            }
          />
          <Textarea
            label="Notlar"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
          />
          <Button onClick={createBooking}>Oluştur</Button>
        </Stack>
      </Modal>

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
            <Text size="sm" c="dimmed">
              {detail.guestEmail}
              {detail.guestPhone ? ` · ${detail.guestPhone}` : ""}
            </Text>
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
            <Badge>{bookingStatusLabels[detail.status]}</Badge>
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
                  <Button size="sm" onClick={() => setStatus(detail.id, "onaylandi")}>
                    Onayla
                  </Button>
                  <Button
                    size="sm"
                    color="red"
                    variant="light"
                    onClick={() => setStatus(detail.id, "iptal")}
                  >
                    İptal
                  </Button>
                </>
              )}
              {detail.status === "onaylandi" && detail.totalMinor != null && (
                <Button
                  size="sm"
                  color="teal"
                  leftSection={<IconWallet size={14} />}
                  onClick={() => startPayment(detail)}
                >
                  Tahsilat başlat
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
