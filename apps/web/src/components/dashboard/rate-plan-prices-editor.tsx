"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { formatPrice, toMajor, toMinor, currencies, currencyLabels, type Currency } from "@/lib/price";

interface PriceRow {
  id: string;
  roomId: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights: number | null;
}

interface RoomOption {
  id: string;
  name: string;
}

interface PriceForm {
  roomId: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMajor: number | null;
  currency: Currency;
  minStayNights: number | null;
}

const emptyForm = (): PriceForm => ({
  roomId: "",
  name: "",
  startDate: "",
  endDate: "",
  priceMajor: null,
  currency: "TRY",
  minStayNights: null,
});

export function RatePlanPricesEditor({
  hotelId,
  planId,
  planName,
  opened,
  onClose,
}: {
  hotelId: string;
  planId: string;
  planName: string;
  opened: boolean;
  onClose: () => void;
}) {
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [form, setForm] = useState<PriceForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!opened) return;
    const [pricesRes, roomsRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotelId}/rate-plans/${planId}/prices`),
      fetch(`/api/manager/hotels/${hotelId}/rooms`),
    ]);
    const pricesJson = await pricesRes.json();
    const roomsJson = await roomsRes.json();
    if (pricesJson.ok) setPrices(pricesJson.prices);
    if (roomsJson.ok) {
      const list = (roomsJson.rooms as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
      }));
      setRooms(list);
      if (list.length > 0 && !form.roomId) {
        setForm((f) => ({ ...f, roomId: list[0].id }));
      }
    }
  }, [hotelId, planId, opened]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startEdit(row: PriceRow) {
    setEditingId(row.id);
    setForm({
      roomId: row.roomId,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      priceMajor: toMajor(row.priceMinor),
      currency: row.currency as Currency,
      minStayNights: row.minStayNights,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm(), roomId: rooms[0]?.id ?? "" });
  }

  async function savePrice() {
    const payload = {
      roomId: form.roomId,
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
      priceMinor: form.priceMajor != null ? toMinor(form.priceMajor) : 0,
      currency: form.currency,
      minStayNights: form.minStayNights,
    };
    const url = `/api/manager/hotels/${hotelId}/rate-plans/${planId}/prices`;
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Fiyat kaydedildi." });
      resetForm();
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydedilemedi." });
    }
  }

  async function removePrice(id: string) {
    const res = await fetch(`/api/manager/hotels/${hotelId}/rate-plans/${planId}/prices`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if ((await res.json()).ok) void reload();
  }

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id.slice(0, 8);

  return (
    <Drawer opened={opened} onClose={onClose} title={`Fiyatlar — ${planName}`} position="right" size="lg">
      <Stack gap="md">
        {!prices ? (
          <Loader />
        ) : (
          <>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Oda</Table.Th>
                  <Table.Th>Dönem</Table.Th>
                  <Table.Th>Fiyat</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {prices.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" size="sm">
                        Henüz fiyat tanımı yok.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {prices.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>{roomName(p.roomId)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.name}</Text>
                      <Text size="xs" c="dimmed">
                        {p.startDate} — {p.endDate}
                      </Text>
                    </Table.Td>
                    <Table.Td>{formatPrice(p.priceMinor, p.currency, false)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => startEdit(p)}>
                          Düzenle
                        </Button>
                        <Button size="xs" color="red" variant="light" onClick={() => removePrice(p.id)}>
                          <IconTrash size={14} />
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Text fw={600} size="sm">
              {editingId ? "Fiyat düzenle" : "Yeni fiyat"}
            </Text>
            <Select
              label="Oda"
              data={rooms.map((r) => ({ value: r.id, label: r.name }))}
              value={form.roomId}
              onChange={(v) => v && setForm({ ...form, roomId: v })}
            />
            <TextInput
              label="Dönem adı"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
            <Group grow>
              <TextInput
                label="Başlangıç"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })}
              />
              <TextInput
                label="Bitiş"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })}
              />
            </Group>
            <Group grow align="flex-end">
              <NumberInput
                label="Gecelik fiyat"
                min={0}
                decimalScale={2}
                value={form.priceMajor ?? ""}
                onChange={(v) =>
                  setForm({ ...form, priceMajor: typeof v === "number" ? v : null })
                }
              />
              <Select
                label="Para birimi"
                data={currencies.map((c) => ({ value: c, label: currencyLabels[c] }))}
                value={form.currency}
                onChange={(v) => v && setForm({ ...form, currency: v as Currency })}
              />
            </Group>
            <NumberInput
              label="Min. gece"
              min={1}
              value={form.minStayNights ?? ""}
              onChange={(v) =>
                setForm({ ...form, minStayNights: v === "" ? null : Number(v) })
              }
            />
            <Group>
              <Button leftSection={<IconPlus size={16} />} onClick={savePrice}>
                {editingId ? "Güncelle" : "Ekle"}
              </Button>
              {editingId && (
                <Button variant="default" onClick={resetForm}>
                  İptal
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
    </Drawer>
  );
}
