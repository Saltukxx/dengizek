"use client";

// ---------------------------------------------------------------------------
// Bugünün işi — genel bakışın üstündeki pano: giriş yapacaklar, çıkış
// yapacaklar, konaklayanlar; ayrıca onay bekleyen ve gelmeyen kayıt uyarıları.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconDoorEnter, IconDoorExit, IconBed } from "@tabler/icons-react";
import { classifyToday, type StayBooking } from "@/lib/booking-stay";
import { newIdempotencyKey } from "@/lib/api-client";
import { PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";

interface TodayBooking extends StayBooking {
  id: string;
  guestName: string;
  roomId: string | null;
  adults: number;
  children: number;
}

type Action = "check_in" | "check_out" | "mark_no_show";

const dayLabel = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function TodayBoard() {
  const { hotel, loading: hotelLoading } = useMyHotel();
  const [data, setData] = useState<{
    today: string;
    rooms: { id: string; name: string }[];
    bookings: TodayBooking[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hotel) return;
    try {
      const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings/calendar?acik=1`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Bugünün listesi alınamadı.");
      setError(null);
      setData({ today: json.today, rooms: json.rooms, bookings: json.bookings });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bugünün listesi alınamadı.");
    }
  }, [hotel]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hotelLoading) return <PanelLoading label="Bugünün işleri yükleniyor…" />;
  if (!hotel) return null;
  if (error) return <PanelError message={error} onRetry={() => void load()} />;
  if (!data) return <PanelLoading label="Bugünün işleri yükleniyor…" />;

  const { arrivals, departures, inHouse, lateArrivals, pending } = classifyToday(
    data.bookings,
    data.today,
  );
  const roomName = (id: string | null) =>
    id ? (data.rooms.find((room) => room.id === id)?.name ?? "—") : "Oda atanmamış";

  async function run(id: string, action: Action, done: string) {
    if (!hotel) return;
    setBusy(id);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, idempotencyKey: newIdempotencyKey(action, id) }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (json?.ok) {
      notifications.show({ color: "green", message: done });
      await load();
    } else {
      notifications.show({ color: "red", message: json?.error ?? "Güncellenemedi." });
    }
  }

  const columns = [
    {
      key: "arrivals",
      title: "Giriş yapacaklar",
      Icon: IconDoorEnter,
      empty: "Bugün giriş yok.",
      rows: arrivals,
      action: (b: TodayBooking) => (
        <Button size="xs" color="teal" style={{ flexShrink: 0 }} loading={busy === b.id} onClick={() => run(b.id, "check_in", "Giriş kaydedildi.")}>
          Girişi kaydet
        </Button>
      ),
    },
    {
      key: "departures",
      title: "Çıkış yapacaklar",
      Icon: IconDoorExit,
      empty: "Bugün çıkış yok.",
      rows: departures,
      action: (b: TodayBooking) => (
        <Button size="xs" color="teal" variant="light" style={{ flexShrink: 0 }} loading={busy === b.id} onClick={() => run(b.id, "check_out", "Çıkış kaydedildi.")}>
          Çıkışı kaydet
        </Button>
      ),
    },
    {
      key: "inHouse",
      title: "Konaklayanlar",
      Icon: IconBed,
      empty: "Şu anda konaklayan yok.",
      rows: inHouse,
      action: () => null,
    },
  ] as const;

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline">
        <Title order={4}>Bugün</Title>
        <Text size="sm" c="dimmed">
          {dayLabel.format(new Date(`${data.today}T12:00:00.000Z`))}
        </Text>
      </Group>

      {pending.length > 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
          <Group justify="space-between" wrap="wrap">
            <Text size="sm">
              Girişi bugün ya da geçmişte olan {pending.length} rezervasyon onay bekliyor.
            </Text>
            <Button component={Link} href="/dashboard/bookings" size="xs" variant="white">
              Rezervasyonlara git
            </Button>
          </Group>
        </Alert>
      )}

      {lateArrivals.length > 0 && (
        <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="Giriş yapmamış misafirler">
          <Stack gap={8}>
            {lateArrivals.map((b) => (
              <Group key={b.id} justify="space-between" wrap="wrap">
                <Text size="sm">
                  {b.guestName} · {roomName(b.roomId)} · giriş {b.checkIn}
                </Text>
                <Group gap="xs">
                  <Button size="xs" color="teal" loading={busy === b.id} onClick={() => run(b.id, "check_in", "Giriş kaydedildi.")}>
                    Girişi kaydet
                  </Button>
                  <Button size="xs" color="orange" variant="light" disabled={busy === b.id} onClick={() => run(b.id, "mark_no_show", "Gelmedi olarak işaretlendi.")}>
                    Gelmedi
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {columns.map(({ key, title, Icon, empty, rows, action }) => (
          <Card key={key} withBorder radius="md" padding="md">
            <Group justify="space-between" mb="sm">
              <Group gap={8}>
                <Icon size={18} />
                <Text fw={600}>{title}</Text>
              </Group>
              <Badge variant="light" color={rows.length > 0 ? "blue" : "gray"}>
                {rows.length}
              </Badge>
            </Group>
            {rows.length === 0 ? (
              <Text size="sm" c="dimmed">
                {empty}
              </Text>
            ) : (
              <Stack gap={10}>
                {rows.map((b) => (
                  <Group key={b.id} justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {b.guestName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {roomName(b.roomId)} · {b.adults} yetişkin
                        {b.children > 0 ? `, ${b.children} çocuk` : ""} ·{" "}
                        çıkış {b.checkOut}
                        {key === "departures" && b.checkOut < data.today ? " (gecikmiş)" : ""}
                      </Text>
                    </div>
                    {action(b)}
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
