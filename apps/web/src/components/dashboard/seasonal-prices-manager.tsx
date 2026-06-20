"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCalendarPlus,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  currencies,
  currencyLabels,
  formatPrice,
  toMajor,
  toMinor,
  type Currency,
} from "@/lib/price";
import {
  formatOccupancySummary,
  occupancyFromApi,
  occupancyToApi,
  validateOccupancyForms,
  type OccupancyPriceForm,
} from "@/lib/occupancy-price";
import { OccupancyPricesEditor } from "./occupancy-prices-editor";
import { useMyHotel } from "./use-my-hotel";

interface ApiRate {
  id: string;
  roomId: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights: number | null;
  occupancyPrices?: { guestCount: number; priceMinor: number }[];
}

interface ApiRoom {
  id: string;
  name: string;
  capacityAdults: number;
  rates: ApiRate[];
}

interface Row {
  key: string;
  id?: string;
  roomId: string;
  roomName: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMajor: number | null;
  currency: Currency;
  minStayNights: number | null;
  occupancyPrices: OccupancyPriceForm[];
  selected: boolean;
  isNew: boolean;
}

interface ApplyForm {
  roomIds: string[];
  name: string;
  startDate: string;
  endDate: string;
  priceMajor: number | null;
  currency: Currency;
  minStayNights: number | null;
  occupancyPrices: OccupancyPriceForm[];
}

const emptyApplyForm = (roomIds: string[]): ApplyForm => ({
  roomIds,
  name: "",
  startDate: "",
  endDate: "",
  priceMajor: null,
  currency: "TRY",
  minStayNights: null,
  occupancyPrices: [],
});

function rowsFromRooms(rooms: ApiRoom[]): Row[] {
  return rooms.flatMap((room) =>
    room.rates.map((rate) => ({
      key: rate.id,
      id: rate.id,
      roomId: room.id,
      roomName: room.name,
      name: rate.name,
      startDate: rate.startDate,
      endDate: rate.endDate,
      priceMajor: toMajor(rate.priceMinor),
      currency: rate.currency as Currency,
      minStayNights: rate.minStayNights,
      occupancyPrices: occupancyFromApi(rate.occupancyPrices),
      selected: false,
      isNew: false,
    })),
  );
}

function rowToPayload(row: Row) {
  return {
    ...(row.id ? { id: row.id } : {}),
    name: row.name.trim(),
    startDate: row.startDate,
    endDate: row.endDate,
    priceMinor: row.priceMajor != null ? toMinor(row.priceMajor) : 0,
    currency: row.currency,
    minStayNights: row.minStayNights,
    occupancyPrices: occupancyToApi(row.occupancyPrices),
  };
}

function validateRow(row: Row): string | null {
  if (!row.name.trim()) return "Dönem adı gerekli.";
  if (!row.startDate || !row.endDate) return "Başlangıç ve bitiş tarihi gerekli.";
  if (row.startDate > row.endDate) return "Bitiş tarihi başlangıçtan önce olamaz.";
  if (row.priceMajor == null || row.priceMajor <= 0) return "Geçerli bir fiyat girin.";
  return validateOccupancyForms(row.occupancyPrices);
}

export function SeasonalPricesManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [rooms, setRooms] = useState<ApiRoom[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState<ApplyForm>(emptyApplyForm([]));
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [occupancyRowKey, setOccupancyRowKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/rooms`);
    const json = await res.json();
    if (json.ok) {
      const list = json.rooms as ApiRoom[];
      setRooms(list);
      setRows(rowsFromRooms(list));
    }
  }, [hotel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const roomOptions = useMemo(
    () => (rooms ?? []).map((r) => ({ value: r.id, label: r.name })),
    [rooms],
  );

  const roomCapacityById = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms ?? []) map.set(room.id, room.capacityAdults);
    return map;
  }, [rooms]);

  const occupancyEditingRow = useMemo(
    () => rows.find((r) => r.key === occupancyRowKey) ?? null,
    [rows, occupancyRowKey],
  );

  const filteredRows = useMemo(
    () => (roomFilter ? rows.filter((r) => r.roomId === roomFilter) : rows),
    [rows, roomFilter],
  );

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows]);
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => r.selected);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleAllVisible(checked: boolean) {
    const visibleKeys = new Set(filteredRows.map((r) => r.key));
    setRows((prev) => prev.map((r) => (visibleKeys.has(r.key) ? { ...r, selected: checked } : r)));
  }

  function addRow() {
    const targetRoom = roomFilter
      ? rooms?.find((r) => r.id === roomFilter)
      : rooms?.[0];
    if (!targetRoom) {
      notifications.show({ color: "red", message: "Önce en az bir oda ekleyin." });
      return;
    }
    const key = `new-${crypto.randomUUID()}`;
    setRows((prev) => [
      ...prev,
      {
        key,
        roomId: targetRoom.id,
        roomName: targetRoom.name,
        name: "",
        startDate: "",
        endDate: "",
        priceMajor: null,
        currency: "TRY",
        minStayNights: null,
        occupancyPrices: [],
        selected: false,
        isNew: true,
      },
    ]);
  }

  function removeSelectedLocal() {
    if (selectedRows.length === 0) return;
    const keys = new Set(selectedRows.map((r) => r.key));
    setRows((prev) => prev.filter((r) => !keys.has(r.key)));
  }

  async function deleteSelectedPersisted() {
    if (!hotel) return;
    const persisted = selectedRows.filter((r) => r.id);
    if (persisted.length === 0) {
      removeSelectedLocal();
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/seasonal-rates/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        ids: persisted.map((r) => r.id as string),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: `${json.deleted} dönem silindi.` });
      removeSelectedLocal();
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silinemedi." });
    }
  }

  async function applyPeriod() {
    if (!hotel) return;
    if (applyForm.roomIds.length === 0) {
      notifications.show({ color: "red", message: "En az bir oda seçin." });
      return;
    }
    if (!applyForm.name.trim() || !applyForm.startDate || !applyForm.endDate) {
      notifications.show({ color: "red", message: "Dönem bilgilerini doldurun." });
      return;
    }
    if (applyForm.startDate > applyForm.endDate) {
      notifications.show({ color: "red", message: "Bitiş tarihi başlangıçtan önce olamaz." });
      return;
    }
    if (applyForm.priceMajor == null || applyForm.priceMajor <= 0) {
      notifications.show({ color: "red", message: "Geçerli bir fiyat girin." });
      return;
    }
    const occErr = validateOccupancyForms(applyForm.occupancyPrices);
    if (occErr) {
      notifications.show({ color: "red", message: occErr });
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/seasonal-rates/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "apply",
        roomIds: applyForm.roomIds,
        period: {
          name: applyForm.name.trim(),
          startDate: applyForm.startDate,
          endDate: applyForm.endDate,
          priceMinor: toMinor(applyForm.priceMajor),
          currency: applyForm.currency,
          minStayNights: applyForm.minStayNights,
          occupancyPrices: occupancyToApi(applyForm.occupancyPrices),
        },
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: "green",
        message: `${json.applied} odaya dönem uygulandı.`,
      });
      setApplyOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Uygulanamadı." });
    }
  }

  async function saveAll() {
    if (!hotel || !rooms) return;

    const byRoom = new Map<string, Row[]>();
    for (const row of rows) {
      const err = validateRow(row);
      if (err) {
        notifications.show({
          color: "red",
          message: `${row.roomName}: ${err}`,
        });
        return;
      }
      const list = byRoom.get(row.roomId) ?? [];
      list.push(row);
      byRoom.set(row.roomId, list);
    }

    for (const [roomId, roomRows] of byRoom) {
      if (roomRows.length > 40) {
        const name = roomRows[0]?.roomName ?? roomId;
        notifications.show({
          color: "red",
          message: `${name}: Oda başına en fazla 40 dönem olabilir.`,
        });
        return;
      }
    }

    const payload = {
      rooms: rooms.map((room) => ({
        roomId: room.id,
        donemler: (byRoom.get(room.id) ?? []).map(rowToPayload),
      })),
    };

    setBusy(true);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/seasonal-rates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Dönemsel fiyatlar kaydedildi." });
      void reload();
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
  if (!hotel || !rooms) return <Loader />;

  if (rooms.length === 0) {
    return (
      <Alert color="blue" icon={<IconAlertCircle size={16} />}>
        Dönemsel fiyat tanımlamak için önce en az bir oda ekleyin.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="sm" wrap="wrap">
          <Select
            label="Oda filtresi"
            placeholder="Tüm odalar"
            clearable
            data={roomOptions}
            value={roomFilter}
            onChange={setRoomFilter}
            w={220}
          />
          <Badge variant="light" size="lg" mt={24}>
            {filteredRows.length} dönem
          </Badge>
        </Group>
        <Group gap="xs" wrap="wrap">
          <Button
            variant="light"
            leftSection={<IconCalendarPlus size={16} />}
            onClick={() => {
              const defaultRooms = roomFilter ? [roomFilter] : rooms.map((r) => r.id);
              setApplyForm(emptyApplyForm(defaultRooms));
              setApplyOpen(true);
            }}
          >
            Toplu dönem uygula
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={addRow}>
            Satır ekle
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            disabled={selectedRows.length === 0}
            loading={busy}
            onClick={() => void deleteSelectedPersisted()}
          >
            Seçilenleri sil ({selectedRows.length})
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            loading={busy}
            onClick={() => void saveAll()}
          >
            Tümünü kaydet
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="md" p={0}>
        <ScrollArea.Autosize mah={560} type="auto">
          <Table highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40}>
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && filteredRows.some((r) => r.selected)}
                    onChange={(e) => toggleAllVisible(e.currentTarget.checked)}
                    aria-label="Tümünü seç"
                  />
                </Table.Th>
                <Table.Th>Oda</Table.Th>
                <Table.Th>Dönem adı</Table.Th>
                <Table.Th>Başlangıç</Table.Th>
                <Table.Th>Bitiş</Table.Th>
                <Table.Th>Baz fiyat</Table.Th>
                <Table.Th>Kişi fiyatları</Table.Th>
                <Table.Th>Para birimi</Table.Th>
                <Table.Th>Min. gece</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text c="dimmed" size="sm" py="md" ta="center">
                      Henüz dönemsel fiyat yok. &quot;Satır ekle&quot; veya &quot;Toplu dönem
                      uygula&quot; ile başlayın.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filteredRows.map((row) => (
                <Table.Tr key={row.key} bg={row.isNew ? "var(--mantine-color-blue-0)" : undefined}>
                  <Table.Td>
                    <Checkbox
                      checked={row.selected}
                      onChange={(e) => patchRow(row.key, { selected: e.currentTarget.checked })}
                      aria-label="Satır seç"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={roomOptions}
                      value={row.roomId}
                      onChange={(v) => {
                        if (!v) return;
                        const room = rooms.find((r) => r.id === v);
                        patchRow(row.key, { roomId: v, roomName: room?.name ?? v });
                      }}
                      searchable
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      placeholder="Yaz 2026"
                      value={row.name}
                      onChange={(e) => patchRow(row.key, { name: e.target.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      type="date"
                      value={row.startDate}
                      onChange={(e) => patchRow(row.key, { startDate: e.target.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      type="date"
                      value={row.endDate}
                      onChange={(e) => patchRow(row.key, { endDate: e.target.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      min={0}
                      decimalScale={2}
                      value={row.priceMajor ?? ""}
                      onChange={(v) =>
                        patchRow(row.key, {
                          priceMajor: typeof v === "number" ? v : v === "" ? null : Number(v),
                        })
                      }
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {formatOccupancySummary(
                          {
                            priceMinor: row.priceMajor != null ? toMinor(row.priceMajor) : 0,
                            currency: row.currency,
                            occupancyPrices: occupancyToApi(row.occupancyPrices),
                          },
                          formatPrice,
                        ) || "—"}
                      </Text>
                      <Button size="compact-xs" variant="light" onClick={() => setOccupancyRowKey(row.key)}>
                        Düzenle ({row.occupancyPrices.length})
                      </Button>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={currencies.map((c) => ({ value: c, label: currencyLabels[c] }))}
                      value={row.currency}
                      onChange={(v) => v && patchRow(row.key, { currency: v as Currency })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      min={1}
                      max={30}
                      value={row.minStayNights ?? ""}
                      onChange={(v) =>
                        patchRow(row.key, {
                          minStayNights:
                            v === "" || v == null ? null : typeof v === "number" ? v : Number(v),
                        })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Paper>

      {filteredRows.length > 0 && (
        <Text size="xs" c="dimmed">
          Önizleme:{" "}
          {filteredRows.slice(0, 3).map((r, i) => (
            <span key={r.key}>
              {i > 0 ? " · " : ""}
              {r.roomName} — {r.name || "…"}:{" "}
              {r.priceMajor != null ? formatPrice(toMinor(r.priceMajor), r.currency, false) : "—"}
            </span>
          ))}
        </Text>
      )}

      <Modal
        opened={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Toplu dönem uygula"
        size="md"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Aynı dönemi seçili odalara tek seferde ekleyin.
          </Text>
          <MultiSelect
            label="Odalar"
            data={roomOptions}
            value={applyForm.roomIds}
            onChange={(v) => setApplyForm((f) => ({ ...f, roomIds: v }))}
            searchable
          />
          <TextInput
            label="Dönem adı"
            placeholder="Yaz 2026"
            value={applyForm.name}
            onChange={(e) => setApplyForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Group grow>
            <TextInput
              label="Başlangıç"
              type="date"
              value={applyForm.startDate}
              onChange={(e) => setApplyForm((f) => ({ ...f, startDate: e.target.value }))}
            />
            <TextInput
              label="Bitiş"
              type="date"
              value={applyForm.endDate}
              onChange={(e) => setApplyForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </Group>
          <Group grow align="flex-end">
            <NumberInput
              label="Gecelik fiyat"
              min={0}
              decimalScale={2}
              value={applyForm.priceMajor ?? ""}
              onChange={(v) =>
                setApplyForm((f) => ({
                  ...f,
                  priceMajor: typeof v === "number" ? v : v === "" ? null : Number(v),
                }))
              }
              thousandSeparator="."
              decimalSeparator=","
            />
            <Select
              label="Para birimi"
              data={currencies.map((c) => ({ value: c, label: currencyLabels[c] }))}
              value={applyForm.currency}
              onChange={(v) => v && setApplyForm((f) => ({ ...f, currency: v as Currency }))}
            />
          </Group>
          <NumberInput
            label="Minimum konaklama (gece)"
            min={1}
            max={30}
            value={applyForm.minStayNights ?? ""}
            onChange={(v) =>
              setApplyForm((f) => ({
                ...f,
                minStayNights:
                  v === "" || v == null ? null : typeof v === "number" ? v : Number(v),
              }))
            }
          />
          <OccupancyPricesEditor
            value={applyForm.occupancyPrices}
            onChange={(occupancyPrices) => setApplyForm((f) => ({ ...f, occupancyPrices }))}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setApplyOpen(false)}>
              İptal
            </Button>
            <Button loading={busy} onClick={() => void applyPeriod()}>
              Uygula
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={occupancyRowKey != null}
        onClose={() => setOccupancyRowKey(null)}
        title={
          occupancyEditingRow
            ? `Kişi fiyatları — ${occupancyEditingRow.roomName} / ${occupancyEditingRow.name || "Yeni dönem"}`
            : "Kişi fiyatları"
        }
        size="md"
      >
        {occupancyEditingRow && (
          <Stack gap="md">
            <OccupancyPricesEditor
              value={occupancyEditingRow.occupancyPrices}
              onChange={(occupancyPrices) =>
                patchRow(occupancyEditingRow.key, { occupancyPrices })
              }
              capacityAdults={roomCapacityById.get(occupancyEditingRow.roomId)}
            />
            <Group justify="flex-end">
              <Button onClick={() => setOccupancyRowKey(null)}>Tamam</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
