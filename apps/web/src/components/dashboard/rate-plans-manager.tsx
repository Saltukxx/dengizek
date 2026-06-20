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
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCoin, IconPlus, IconTrash } from "@tabler/icons-react";
import { boardTypeLabels, boardTypes } from "@/lib/schemas/hotel-content";
import { RatePlanPricesEditor } from "./rate-plan-prices-editor";
import { useMyHotel } from "./use-my-hotel";

interface PlanRow {
  id: string;
  name: string;
  isRefundable: boolean;
  isDefault: boolean;
  boardTypeOverride: string | null;
  cancellationRuleId: string | null;
}

interface RuleOption {
  id: string;
  name: string;
}

export function RatePlansManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [rules, setRules] = useState<RuleOption[]>([]);
  const [open, setOpen] = useState(false);
  const [pricesPlan, setPricesPlan] = useState<PlanRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    isRefundable: true,
    isDefault: false,
    boardTypeOverride: "" as string | null,
    cancellationRuleId: "" as string | null,
  });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const [plansRes, rulesRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotel.id}/rate-plans`),
      fetch(`/api/manager/hotels/${hotel.id}/cancellation-rules`),
    ]);
    const plansJson = await plansRes.json();
    const rulesJson = await rulesRes.json();
    if (plansJson.ok) setPlans(plansJson.plans);
    if (rulesJson.ok) setRules(rulesJson.rules);
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

  const ruleOptions = rules.map((r) => ({ value: r.id, label: r.name }));
  const boardOptions = boardTypes.map((b) => ({
    value: b,
    label: boardTypeLabels[b],
  }));

  async function createPlan() {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/rate-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        isRefundable: form.isRefundable,
        isDefault: form.isDefault,
        boardTypeOverride: form.boardTypeOverride || null,
        cancellationRuleId: form.cancellationRuleId || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Fiyat planı eklendi." });
      setOpen(false);
      setForm({
        name: "",
        isRefundable: true,
        isDefault: false,
        boardTypeOverride: null,
        cancellationRuleId: null,
      });
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
              <Table.Th>Pansiyon</Table.Th>
              <Table.Th>İptal kuralı</Table.Th>
              <Table.Th>Varsayılan</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {plans.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
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
                  {p.boardTypeOverride
                    ? (boardTypeLabels[p.boardTypeOverride as keyof typeof boardTypeLabels] ??
                      p.boardTypeOverride)
                    : "—"}
                </Table.Td>
                <Table.Td>
                  {rules.find((r) => r.id === p.cancellationRuleId)?.name ?? "—"}
                </Table.Td>
                <Table.Td>
                  <Switch checked={p.isDefault} onChange={() => toggleDefault(p)} label="Varsayılan" />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconCoin size={14} />}
                      onClick={() => setPricesPlan(p)}
                    >
                      Fiyatları yönet
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => removePlan(p.id)}>
                      <IconTrash size={14} />
                    </Button>
                  </Group>
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
          <Select
            label="Pansiyon tipi (override)"
            placeholder="Oda varsayılanını kullan"
            clearable
            data={boardOptions}
            value={form.boardTypeOverride || null}
            onChange={(v) => setForm({ ...form, boardTypeOverride: v })}
          />
          <Select
            label="İptal kuralı"
            placeholder="Seçin (opsiyonel)"
            clearable
            data={ruleOptions}
            value={form.cancellationRuleId || null}
            onChange={(v) => setForm({ ...form, cancellationRuleId: v })}
          />
          <Button onClick={createPlan}>Kaydet</Button>
        </Stack>
      </Modal>
      {pricesPlan && (
        <RatePlanPricesEditor
          hotelId={hotel.id}
          planId={pricesPlan.id}
          planName={pricesPlan.name}
          opened={!!pricesPlan}
          onClose={() => setPricesPlan(null)}
        />
      )}
    </Stack>
  );
}
