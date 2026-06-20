"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface PromotionRow {
  id: string;
  name: string;
  discountPercent: number;
  validFrom: string | null;
  validTo: string | null;
  minNights: number | null;
  isActive: boolean;
}

export function PromotionsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    discountPercent: 10,
    validFrom: "",
    validTo: "",
    minNights: null as number | null,
    isActive: true,
  });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/promotions`);
    const json = await res.json();
    if (json.ok) setPromotions(json.promotions);
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

  async function createPromotion() {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        roomIds: [],
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Kampanya oluşturuldu." });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Oluşturulamadı." });
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
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          Kampanya ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>İndirim</Table.Th>
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
                  {p.validFrom ?? "—"} — {p.validTo ?? "—"}
                </Table.Td>
                <Table.Td>
                  <Badge color={p.isActive ? "green" : "gray"}>
                    {p.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => toggleActive(p.id, p.isActive)}>
                      {p.isActive ? "Durdur" : "Aktifleştir"}
                    </Button>
                    <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => removePromotion(p.id)}>
                      Sil
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="Yeni kampanya">
        <Stack gap="sm">
          <TextInput label="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <NumberInput label="İndirim (%)" min={1} max={90} value={form.discountPercent} onChange={(v) => setForm({ ...form, discountPercent: Number(v) || 10 })} />
          <TextInput label="Başlangıç" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.currentTarget.value })} />
          <TextInput label="Bitiş" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.currentTarget.value })} />
          <NumberInput label="Min. gece" value={form.minNights ?? ""} onChange={(v) => setForm({ ...form, minNights: v === "" ? null : Number(v) })} />
          <Switch label="Aktif" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.currentTarget.checked })} />
          <Button onClick={createPromotion}>Oluştur</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
