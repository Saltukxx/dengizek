"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface RoomOption {
  id: string;
  name: string;
}

interface InventoryRow {
  roomId: string;
  date: string;
  allotment: number;
  stopSell: boolean;
  minStay: number | null;
}

type DayDraft = {
  allotment: number;
  stopSell: boolean;
  minStay: number | null;
};

const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function padDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => padDate(year, month, i + 1));
}

export function InventoryManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [draft, setDraft] = useState<Record<string, DayDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const dates = useMemo(() => daysInMonth(year, month), [year, month]);
  const from = dates[0];
  const to = dates[dates.length - 1];

  useEffect(() => {
    if (!hotel) return;
    void fetch(`/api/manager/hotels/${hotel.id}/rooms`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          const list = (j.rooms as { id: string; name: string }[]).map((r) => ({
            id: r.id,
            name: r.name,
          }));
          setRooms(list);
          if (list.length > 0 && !roomId) setRoomId(list[0].id);
        }
      });
  }, [hotel, roomId]);

  const loadInventory = useCallback(async () => {
    if (!hotel || !roomId) return;
    setLoading(true);
    const params = new URLSearchParams({ roomId, from, to });
    const res = await fetch(`/api/manager/hotels/${hotel.id}/inventory?${params}`);
    const json = await res.json();
    setLoading(false);
    if (json.ok) {
      const map: Record<string, DayDraft> = {};
      for (const d of dates) {
        map[d] = { allotment: 0, stopSell: false, minStay: null };
      }
      for (const row of json.inventory as InventoryRow[]) {
        map[row.date] = {
          allotment: row.allotment,
          stopSell: row.stopSell,
          minStay: row.minStay,
        };
      }
      setDraft(map);
    }
  }, [hotel, roomId, from, to, dates]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function patchDay(date: string, patch: Partial<DayDraft>) {
    setDraft((prev) => ({
      ...prev,
      [date]: { ...prev[date], ...patch },
    }));
  }

  async function save() {
    if (!hotel || !roomId) return;
    setSaving(true);
    const entries = dates.map((date) => ({
      roomId,
      date,
      allotment: draft[date]?.allotment ?? 0,
      stopSell: draft[date]?.stopSell ?? false,
      minStay: draft[date]?.minStay ?? null,
      cta: false,
      ctd: false,
    }));
    const res = await fetch(`/api/manager/hotels/${hotel.id}/inventory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Envanter kaydedildi." });
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydedilemedi." });
    }
  }

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!hotel) return <Loader />;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Select
          label="Oda"
          placeholder="Oda seçin"
          data={rooms.map((r) => ({ value: r.id, label: r.name }))}
          value={roomId}
          onChange={setRoomId}
          w={260}
        />
        <Group gap="xs" mt={24}>
          <ActionIcon variant="light" onClick={prevMonth} aria-label="Önceki ay">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} miw={140} ta="center">
            {MONTH_NAMES[month]} {year}
          </Text>
          <ActionIcon variant="light" onClick={nextMonth} aria-label="Sonraki ay">
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        <Button mt={24} loading={saving} onClick={save} disabled={!roomId}>
          Kaydet
        </Button>
      </Group>

      {rooms.length === 0 && (
        <Alert color="yellow">Envanter yönetmek için önce oda tanımlayın.</Alert>
      )}

      {roomId && (
        <Paper withBorder radius="md">
          {loading ? (
            <Loader m="lg" />
          ) : (
            <ScrollArea>
              <Table highlightOnHover striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tarih</Table.Th>
                    <Table.Th>Kontenjan</Table.Th>
                    <Table.Th>Stop-sell</Table.Th>
                    <Table.Th>Min. gece</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dates.map((date) => {
                    const row = draft[date] ?? { allotment: 0, stopSell: false, minStay: null };
                    const dayNum = new Date(date + "T12:00:00").getDate();
                    const weekday = new Date(date + "T12:00:00").toLocaleDateString("tr-TR", {
                      weekday: "short",
                    });
                    return (
                      <Table.Tr key={date}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {dayNum} {weekday}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {date}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            min={0}
                            max={999}
                            size="xs"
                            w={80}
                            value={row.allotment}
                            onChange={(v) =>
                              patchDay(date, { allotment: typeof v === "number" ? v : 0 })
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          <Switch
                            size="sm"
                            checked={row.stopSell}
                            onChange={(e) => patchDay(date, { stopSell: e.currentTarget.checked })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            min={1}
                            size="xs"
                            w={80}
                            value={row.minStay ?? ""}
                            onChange={(v) =>
                              patchDay(date, { minStay: v === "" ? null : Number(v) })
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Paper>
      )}
    </Stack>
  );
}
