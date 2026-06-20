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
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface PlanRow {
  id: string;
  name: string;
  isRefundable: boolean;
  isDefault: boolean;
  boardTypeOverride: string | null;
}

export function RatePlansManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", isRefundable: true, isDefault: false });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/rate-plans`);
    const json = await res.json();
    if (json.ok) setPlans(json.plans);
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
  if (!hotel || !plans) return <Loader />;

  async function createPlan() {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/rate-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Fiyat planı eklendi." });
      setOpen(false);
      setForm({ name: "", isRefundable: true, isDefault: false });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Eklenemedi." });
    }
  }

  async function toggleDefault(plan: PlanRow) {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/rate-plans`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, isDefault: !plan.isDefault }),
    });
    if ((await res.json()).ok) void reload();
  }

  async function removePlan(id: string) {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/rate-plans`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if ((await res.json()).ok) void reload();
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          Plan ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>İade</Table.Th>
              <Table.Th>Varsayılan</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {plans.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Fiyat planı yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {plans.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>
                  <Badge color={p.isRefundable ? "green" : "orange"}>
                    {p.isRefundable ? "İade edilebilir" : "İade yok"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch checked={p.isDefault} onChange={() => toggleDefault(p)} label="Varsayılan" />
                </Table.Td>
                <Table.Td>
                  <Button size="xs" color="red" variant="light" onClick={() => removePlan(p.id)}>
                    <IconTrash size={14} />
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="Yeni fiyat planı">
        <Stack gap="sm">
          <TextInput
            label="Plan adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <Switch
            label="İade edilebilir"
            checked={form.isRefundable}
            onChange={(e) => setForm({ ...form, isRefundable: e.currentTarget.checked })}
          />
          <Switch
            label="Varsayılan plan"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.currentTarget.checked })}
          />
          <Button onClick={createPlan}>Kaydet</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
