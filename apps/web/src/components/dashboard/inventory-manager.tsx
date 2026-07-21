"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
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
import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconWand } from "@tabler/icons-react";
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
  cta: boolean;
  ctd: boolean;
}

type DayDraft = {
  allotment: number;
  stopSell: boolean;
  minStay: number | null;
  cta: boolean;
  ctd: boolean;
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
  const [dirty, setDirty] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRange, setBulkRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [bulkFields, setBulkFields] = useState({
    allotment: { enabled: false, value: 0 },
    stopSell: { enabled: false, value: false },
    minStay: { enabled: false, value: null as number | null },
    cta: { enabled: false, value: false },
    ctd: { enabled: false, value: false },
  });

  const dates = useMemo(() => daysInMonth(year, month), [year, month]);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const bulkTargetDates = useMemo(() => {
    if (!bulkRange.start || !bulkRange.end) return [];
    return dates.filter((d) => d >= bulkRange.start! && d <= bulkRange.end!);
  }, [dates, bulkRange]);
  const bulkHasField =
    bulkFields.allotment.enabled ||
    bulkFields.stopSell.enabled ||
    bulkFields.minStay.enabled ||
    bulkFields.cta.enabled ||
    bulkFields.ctd.enabled;

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
        map[d] = { allotment: 0, stopSell: false, minStay: null, cta: false, ctd: false };
      }
      for (const row of json.inventory as InventoryRow[]) {
        map[row.date] = {
          allotment: row.allotment,
          stopSell: row.stopSell,
          minStay: row.minStay,
          cta: row.cta,
          ctd: row.ctd,
        };
      }
      setDraft(map);
      setDirty(false);
    }
  }, [hotel, roomId, from, to, dates]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      [date]: { ...prev[date], ...patch },
    }));
  }

  function openBulk() {
    setBulkRange({ start: dates[0] ?? null, end: dates[dates.length - 1] ?? null });
    setBulkFields({
      allotment: { enabled: false, value: 0 },
      stopSell: { enabled: false, value: false },
      minStay: { enabled: false, value: null },
      cta: { enabled: false, value: false },
      ctd: { enabled: false, value: false },
    });
    setBulkOpen(true);
  }

  function applyBulk() {
    if (bulkTargetDates.length === 0 || !bulkHasField) return;
    setDirty(true);
    setDraft((prev) => {
      const next = { ...prev };
      for (const date of bulkTargetDates) {
        const current = next[date] ?? { allotment: 0, stopSell: false, minStay: null, cta: false, ctd: false };
        next[date] = {
          allotment: bulkFields.allotment.enabled ? bulkFields.allotment.value : current.allotment,
          stopSell: bulkFields.stopSell.enabled ? bulkFields.stopSell.value : current.stopSell,
          minStay: bulkFields.minStay.enabled ? bulkFields.minStay.value : current.minStay,
          cta: bulkFields.cta.enabled ? bulkFields.cta.value : current.cta,
          ctd: bulkFields.ctd.enabled ? bulkFields.ctd.value : current.ctd,
        };
      }
      return next;
    });
    notifications.show({
      color: "blue",
      message: `${bulkTargetDates.length} gün güncellendi. Kalıcı olması için "Kaydet"e basın.`,
    });
    setBulkOpen(false);
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
      cta: draft[date]?.cta ?? false,
      ctd: draft[date]?.ctd ?? false,
    }));
    const res = await fetch(`/api/manager/hotels/${hotel.id}/inventory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      setDirty(false);
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

  function navigateMonth(direction: -1 | 1) {
    if (dirty && !window.confirm("Kaydedilmemiş envanter değişiklikleri silinecek. Devam edilsin mi?")) return;
    if (direction < 0) prevMonth(); else nextMonth();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Select
          label="Oda"
          placeholder="Oda seçin"
          data={rooms.map((r) => ({ value: r.id, label: r.name }))}
          value={roomId}
          onChange={(next) => {
            if (dirty && !window.confirm("Kaydedilmemiş envanter değişiklikleri silinecek. Devam edilsin mi?")) return;
            setRoomId(next);
          }}
          w={260}
        />
        <Group gap="xs" mt={24}>
          <ActionIcon variant="light" onClick={() => navigateMonth(-1)} aria-label="Önceki ay">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} miw={140} ta="center">
            {MONTH_NAMES[month]} {year}
          </Text>
          <ActionIcon variant="light" onClick={() => navigateMonth(1)} aria-label="Sonraki ay">
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        <Group gap="xs" mt={24}>
          <Button
            variant="light"
            leftSection={<IconWand size={16} />}
            onClick={openBulk}
            disabled={!roomId}
          >
            Toplu uygula
          </Button>
          <Button loading={saving} onClick={save} disabled={!roomId || !dirty}>
            Kaydet
          </Button>
        </Group>
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
                    <Table.Th>Girişe kapalı</Table.Th>
                    <Table.Th>Çıkışa kapalı</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dates.map((date) => {
                    const row = draft[date] ?? { allotment: 0, stopSell: false, minStay: null, cta: false, ctd: false };
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
                        <Table.Td><Switch size="sm" checked={row.cta} onChange={(e) => patchDay(date, { cta: e.currentTarget.checked })} /></Table.Td>
                        <Table.Td><Switch size="sm" checked={row.ctd} onChange={(e) => patchDay(date, { ctd: e.currentTarget.checked })} /></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Paper>
      )}

      <Modal opened={bulkOpen} onClose={() => setBulkOpen(false)} title="Toplu uygula" size="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Seçili tarih aralığındaki günlere, işaretlediğiniz alanları uygular. Uyguladıktan sonra
            kalıcı olması için &quot;Kaydet&quot;e basmanız gerekir.
          </Text>
          <Group grow>
            <Select
              label="Başlangıç"
              data={dates.map((d) => ({ value: d, label: d }))}
              value={bulkRange.start}
              onChange={(v) => setBulkRange((r) => ({ ...r, start: v }))}
            />
            <Select
              label="Bitiş"
              data={dates.map((d) => ({ value: d, label: d }))}
              value={bulkRange.end}
              onChange={(v) => setBulkRange((r) => ({ ...r, end: v }))}
            />
          </Group>
          <Paper withBorder p="sm" radius="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Checkbox
                  label="Kontenjan"
                  checked={bulkFields.allotment.enabled}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, allotment: { ...f.allotment, enabled } }));
                  }}
                />
                <NumberInput
                  min={0}
                  max={999}
                  size="xs"
                  w={100}
                  disabled={!bulkFields.allotment.enabled}
                  value={bulkFields.allotment.value}
                  onChange={(v) => {
                    const value = typeof v === "number" ? v : 0;
                    setBulkFields((f) => ({ ...f, allotment: { ...f.allotment, value } }));
                  }}
                />
              </Group>
              <Group justify="space-between">
                <Checkbox
                  label="Stop-sell"
                  checked={bulkFields.stopSell.enabled}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, stopSell: { ...f.stopSell, enabled } }));
                  }}
                />
                <Switch
                  disabled={!bulkFields.stopSell.enabled}
                  checked={bulkFields.stopSell.value}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, stopSell: { ...f.stopSell, value } }));
                  }}
                />
              </Group>
              <Group justify="space-between">
                <Checkbox
                  label="Min. gece"
                  checked={bulkFields.minStay.enabled}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, minStay: { ...f.minStay, enabled } }));
                  }}
                />
                <NumberInput
                  min={1}
                  size="xs"
                  w={100}
                  disabled={!bulkFields.minStay.enabled}
                  value={bulkFields.minStay.value ?? ""}
                  onChange={(v) => {
                    const value = v === "" ? null : Number(v);
                    setBulkFields((f) => ({ ...f, minStay: { ...f.minStay, value } }));
                  }}
                />
              </Group>
              <Group justify="space-between">
                <Checkbox
                  label="Girişe kapalı"
                  checked={bulkFields.cta.enabled}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, cta: { ...f.cta, enabled } }));
                  }}
                />
                <Switch
                  disabled={!bulkFields.cta.enabled}
                  checked={bulkFields.cta.value}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, cta: { ...f.cta, value } }));
                  }}
                />
              </Group>
              <Group justify="space-between">
                <Checkbox
                  label="Çıkışa kapalı"
                  checked={bulkFields.ctd.enabled}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, ctd: { ...f.ctd, enabled } }));
                  }}
                />
                <Switch
                  disabled={!bulkFields.ctd.enabled}
                  checked={bulkFields.ctd.value}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    setBulkFields((f) => ({ ...f, ctd: { ...f.ctd, value } }));
                  }}
                />
              </Group>
            </Stack>
          </Paper>
          <Button onClick={applyBulk} disabled={bulkTargetDates.length === 0 || !bulkHasField}>
            Uygula ({bulkTargetDates.length} gün)
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
