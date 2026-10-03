"use client";

// ---------------------------------------------------------------------------
// Rezervasyon takvimi — oda tipleri satırda, günler sütunda.
// Bir oda tipi birden çok birim taşıdığı için çakışan kayıtlar alt alta
// şeritlere dizilir; her günün üstünde "dolu / birim" sayacı durur.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Group, Paper, Text } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  addDays,
  assignLanes,
  dayRange,
  stayState,
  stayStateColors,
  stayStateLabels,
  type StayBooking,
} from "@/lib/booking-stay";
import { PanelError, PanelLoading } from "@/components/panel-resource-state";

export interface CalendarBooking extends StayBooking {
  id: string;
  guestName: string;
  roomId: string | null;
  adults: number;
  children: number;
}

interface CalendarRoom {
  id: string;
  name: string;
  unitCount: number | null;
}

const WINDOW_DAYS = 14;
const UNASSIGNED = "__unassigned__";
const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

export function BookingsCalendar<T extends CalendarBooking>({
  hotelId,
  reloadKey,
  onSelect,
}: {
  hotelId: string;
  /** Liste tarafında kayıt değişince takvim yeniden okunur. */
  reloadKey: number;
  onSelect: (booking: T) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [data, setData] = useState<{ today: string; rooms: CalendarRoom[]; bookings: T[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) {
      params.set("baslangic", from);
      params.set("bitis", addDays(from, WINDOW_DAYS - 1));
    }
    try {
      const res = await fetch(`/api/manager/hotels/${hotelId}/bookings/calendar?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Takvim alınamadı.");
      setError(null);
      setData({ today: json.today, rooms: json.rooms, bookings: json.bookings });
      if (!from) setFrom(json.from);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Takvim alınamadı.");
    }
  }, [hotelId, from]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const days = useMemo(() => (from ? dayRange(from, WINDOW_DAYS) : []), [from]);

  const rows = useMemo(() => {
    if (!data || days.length === 0) return [];
    const windowEnd = addDays(days[days.length - 1], 1);
    const byRoom = new Map<string, T[]>();
    for (const booking of data.bookings) {
      const key = booking.roomId ?? UNASSIGNED;
      byRoom.set(key, [...(byRoom.get(key) ?? []), booking]);
    }
    const list: { id: string; name: string; units: number | null }[] = data.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      units: Math.max(1, room.unitCount ?? 1),
    }));
    if (byRoom.has(UNASSIGNED)) list.push({ id: UNASSIGNED, name: "Oda atanmamış", units: null });

    return list.map((room) => {
      // Yalnız pencerede en az bir gecesi olan kayıtlar çizilir.
      const visible = (byRoom.get(room.id) ?? []).filter(
        (b) => b.checkIn < windowEnd && b.checkOut > days[0],
      );
      const { placed, laneCount } = assignLanes(visible);
      const taken = days.map(
        (day) =>
          visible.filter((b) => b.status !== "no_show" && b.checkIn <= day && day < b.checkOut).length,
      );
      return { ...room, placed, laneCount, taken, windowEnd };
    });
  }, [data, days]);

  if (error) return <PanelError message={error} onRetry={() => void load()} />;
  if (!data || !from) return <PanelLoading label="Takvim yükleniyor…" />;

  const columns = `minmax(140px, 180px) repeat(${days.length}, minmax(52px, 1fr))`;

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Text fw={600}>
          {monthLabel.format(asDate(days[0]))} – {monthLabel.format(asDate(days[days.length - 1]))}
        </Text>
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="Önceki hafta" onClick={() => setFrom(addDays(from, -7))}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Button size="xs" variant="default" onClick={() => setFrom(data.today)}>
            Bugün
          </Button>
          <ActionIcon variant="default" aria-label="Sonraki hafta" onClick={() => setFrom(addDays(from, 7))}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <div className="pn-cal" role="table" aria-label="Rezervasyon takvimi">
        <div className="pn-cal-row pn-cal-head" role="row" style={{ gridTemplateColumns: columns }}>
          <div className="pn-cal-room" role="columnheader">
            Oda tipi
          </div>
          {days.map((day) => (
            <div
              key={day}
              className="pn-cal-day"
              role="columnheader"
              data-today={day === data.today}
              data-weekend={[0, 6].includes(asDate(day).getUTCDay())}
            >
              <span>{weekday.format(asDate(day))}</span>
              <strong>{Number(day.slice(8))}</strong>
            </div>
          ))}
        </div>

        {rows.length === 0 && (
          <Text c="dimmed" size="sm" p="md">
            Takvim için önce oda tipi tanımlayın.
          </Text>
        )}

        {rows.map((room) => (
          <div
            key={room.id}
            className="pn-cal-row"
            role="row"
            style={{
              gridTemplateColumns: columns,
              gridTemplateRows: `24px repeat(${room.laneCount}, 30px)`,
            }}
          >
            <div className="pn-cal-room" role="rowheader" style={{ gridRow: "1 / -1" }}>
              <Text size="sm" fw={600} lineClamp={2}>
                {room.name}
              </Text>
              {room.units != null && (
                <Text size="xs" c="dimmed">
                  {room.units} birim
                </Text>
              )}
            </div>

            {days.map((day, i) => (
              <div
                key={day}
                className="pn-cal-cell"
                data-today={day === data.today}
                data-weekend={[0, 6].includes(asDate(day).getUTCDay())}
                style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
              />
            ))}

            {days.map((day, i) => (
              <div
                key={`n-${day}`}
                className="pn-cal-count"
                data-full={room.units != null && room.taken[i] >= room.units}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                title={room.units != null ? `${room.taken[i]} dolu / ${room.units} birim` : undefined}
              >
                {room.units != null ? `${room.taken[i]}/${room.units}` : room.taken[i] || ""}
              </div>
            ))}

            {room.placed.map(({ booking, lane }) => {
              const start = booking.checkIn < days[0] ? days[0] : booking.checkIn;
              const end = booking.checkOut > room.windowEnd ? room.windowEnd : booking.checkOut;
              const startCol = days.indexOf(start) + 2;
              const span = Math.max(1, (asDate(end).getTime() - asDate(start).getTime()) / 86_400_000);
              const state = stayState(booking);
              const color = stayStateColors[state];
              return (
                <button
                  key={booking.id}
                  type="button"
                  className="pn-cal-bar"
                  data-open-start={booking.checkIn < days[0]}
                  data-open-end={booking.checkOut > room.windowEnd}
                  style={{
                    gridColumn: `${startCol} / span ${span}`,
                    gridRow: lane + 2,
                    background: `var(--mantine-color-${color}-light)`,
                    color: `var(--mantine-color-${color}-light-color)`,
                    borderColor: `var(--mantine-color-${color}-outline)`,
                  }}
                  title={`${booking.guestName} · ${booking.checkIn} → ${booking.checkOut} · ${stayStateLabels[state]}`}
                  onClick={() => onSelect(booking)}
                >
                  {booking.guestName}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <Group gap="md" mt="sm">
        {(["beklemede", "onaylandi", "konakliyor", "cikis_yapti", "no_show"] as const).map((state) => (
          <Group key={state} gap={6}>
            <span
              className="pn-cal-swatch"
              style={{ background: `var(--mantine-color-${stayStateColors[state]}-light-color)` }}
            />
            <Text size="xs" c="dimmed">
              {stayStateLabels[state]}
            </Text>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}
