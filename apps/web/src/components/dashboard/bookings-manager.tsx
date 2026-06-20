"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlus } from "@tabler/icons-react";
import { bookingStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface BookingRow {
  id: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  status: "beklemede" | "onaylandi" | "iptal" | "no_show";
  totalMinor: number | null;
  currency: string;
}

export function BookingsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    checkIn: "",
    checkOut: "",
    adults: 2,
    children: 0,
  });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = durum ? `?durum=${durum}` : "";
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings${params}`);
    const json = await res.json();
    if (json.ok) setBookings(json.bookings);
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
  if (!hotel || !bookings) return <Loader />;

  async function createBooking() {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if ((await res.json()).ok) {
      notifications.show({ color: "green", message: "Rezervasyon oluşturuldu." });
      setOpen(false);
      void reload();
    }
  }

  async function setStatus(id: string, status: BookingRow["status"]) {
    if (!hotel) return;
    await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void reload();
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
              <Table.Th>Tarihler</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bookings.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>
                  <Text fw={500}>{b.guestName}</Text>
                  <Text size="xs" c="dimmed">
                    {b.guestEmail}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {b.checkIn} — {b.checkOut}
                  <Text size="xs" c="dimmed">
                    {b.adults} yetişkin, {b.children} çocuk
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge>{bookingStatusLabels[b.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  {b.status === "beklemede" && (
                    <Group gap="xs">
                      <Button size="xs" onClick={() => setStatus(b.id, "onaylandi")}>
                        Onayla
                      </Button>
                      <Button size="xs" variant="light" color="red" onClick={() => setStatus(b.id, "iptal")}>
                        İptal
                      </Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="Yeni rezervasyon">
        <Stack gap="sm">
          <TextInput label="Misafir adı" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.currentTarget.value })} />
          <TextInput label="E-posta" type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.currentTarget.value })} />
          <TextInput label="Giriş" type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.currentTarget.value })} />
          <TextInput label="Çıkış" type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.currentTarget.value })} />
          <Button onClick={createBooking}>Oluştur</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
