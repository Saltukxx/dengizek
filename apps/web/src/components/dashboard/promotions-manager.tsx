"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface PromotionRow {
  id: string;
  name: string;
  discountPercent: number;
  validFrom: string | null;
  validTo: string | null;
  minNights: number | null;
  roomIds: string[];
  isActive: boolean;
}

interface RoomOption {
  id: string;
  name: string;
}

interface PromoForm {
  name: string;
  discountPercent: number;
  validFrom: string;
  validTo: string;
  minNights: number | null;
  roomIds: string[];
  isActive: boolean;
}

const emptyForm: PromoForm = {
  name: "",
  discountPercent: 10,
  validFrom: "",
  validTo: "",
  minNights: null,
  roomIds: [],
  isActive: true,
};

export function PromotionsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const [promoRes, roomsRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotel.id}/promotions`),
      fetch(`/api/manager/hotels/${hotel.id}/rooms`),
    ]);
    const promoJson = await promoRes.json();
    const roomsJson = await roomsRes.json();
    if (promoJson.ok) setPromotions(promoJson.promotions);
    if (roomsJson.ok) {
      setRooms(
        (roomsJson.rooms as { id: string; name: string }[]).map((r) => ({
          id: r.id,
          name: r.name,
        })),
      );
    }
  }, [hotel]);

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
  if (!hotel || !promotions) return <Loader />;

  const roomOptions = rooms.map((r) => ({ value: r.id, label: r.name }));
  const roomLabel = (ids: string[]) =>
    ids.length === 0
      ? "Tüm odalar"
      : ids.map((id) => rooms.find((r) => r.id === id)?.name ?? id.slice(0, 6)).join(", ");

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: PromotionRow) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      discountPercent: p.discountPercent,
      validFrom: p.validFrom ?? "",
      validTo: p.validTo ?? "",
      minNights: p.minNights,
      roomIds: p.roomIds,
      isActive: p.isActive,
    });
    setOpen(true);
  }

  async function save() {
    const payload = {
      name: form.name,
      discountPercent: form.discountPercent,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      minNights: form.minNights,
      roomIds: form.roomIds,
      isActive: form.isActive,
    };
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({
        color: "green",
        message: editingId ? "Kampanya güncellendi." : "Kampanya oluşturuldu.",
      });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydedilemedi." });
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    void reload();
  }

  async function removePromotion(id: string) {
    await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void reload();
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Kampanya ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>İndirim</Table.Th>
              <Table.Th>Odalar</Table.Th>
              <Table.Th>Geçerlilik</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {promotions.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>%{p.discountPercent}</Table.Td>
                <Table.Td>
                  <Text size="xs" lineClamp={2} maw={160}>
                    {roomLabel(p.roomIds)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.validFrom ?? "—"} — {p.validTo ?? "—"}
                  {p.minNights != null && (
                    <Text size="xs" c="dimmed">
                      min. {p.minNights} gece
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={p.isActive ? "green" : "gray"}>
                    {p.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openEdit(p)}>
                      <IconPencil size={14} />
                    </Button>
                    <Button size="xs" variant="light" onClick={() => toggleActive(p.id, p.isActive)}>
                      {p.isActive ? "Durdur" : "Aktifleştir"}
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removePromotion(p.id)}
                    >
                      Sil
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Kampanyayı düzenle" : "Yeni kampanya"}
      >
        <Stack gap="sm">
          <TextInput
            label="Ad"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <NumberInput
            label="İndirim (%)"
            min={1}
            max={90}
            value={form.discountPercent}
            onChange={(v) => setForm({ ...form, discountPercent: Number(v) || 10 })}
          />
          <MultiSelect
            label="Odalar"
            description="Boş bırakılırsa tüm odalara uygulanır"
            data={roomOptions}
            value={form.roomIds}
            onChange={(v) => setForm({ ...form, roomIds: v })}
            clearable
          />
          <TextInput
            label="Başlangıç"
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.currentTarget.value })}
          />
          <TextInput
            label="Bitiş"
            type="date"
            value={form.validTo}
            onChange={(e) => setForm({ ...form, validTo: e.currentTarget.value })}
          />
          <NumberInput
            label="Min. gece"
            value={form.minNights ?? ""}
            onChange={(v) => setForm({ ...form, minNights: v === "" ? null : Number(v) })}
          />
          <Switch
            label="Aktif"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.currentTarget.checked })}
          />
          <Button onClick={save}>{editingId ? "Güncelle" : "Oluştur"}</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
