"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface RuleRow {
  id: string;
  name: string;
  freeUntilDaysBefore: number | null;
  penaltyPercent: number | null;
  depositPercent: number | null;
  customText: string | null;
}

interface RuleForm {
  name: string;
  freeUntilDaysBefore: number | null;
  penaltyPercent: number | null;
  depositPercent: number | null;
  customText: string;
}

const emptyForm: RuleForm = {
  name: "",
  freeUntilDaysBefore: null,
  penaltyPercent: null,
  depositPercent: null,
  customText: "",
};

export function formatCancellationRuleSummary(rule: RuleRow): string {
  const parts: string[] = [];
  if (rule.freeUntilDaysBefore != null) {
    parts.push(`Girişten ${rule.freeUntilDaysBefore} gün öncesine kadar ücretsiz iptal`);
  }
  if (rule.penaltyPercent != null) {
    parts.push(`İptal cezası: %${rule.penaltyPercent}`);
  }
  if (rule.depositPercent != null) {
    parts.push(`Depozito: %${rule.depositPercent}`);
  }
  if (rule.customText?.trim()) {
    parts.push(rule.customText.trim());
  }
  return parts.join(" · ") || rule.name;
}

export function CancellationRulesManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/cancellation-rules`);
    const json = await res.json();
    if (json.ok) setRules(json.rules);
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
  if (!hotel || !rules) return <Loader />;

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(rule: RuleRow) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      freeUntilDaysBefore: rule.freeUntilDaysBefore,
      penaltyPercent: rule.penaltyPercent,
      depositPercent: rule.depositPercent,
      customText: rule.customText ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const payload = {
      name: form.name,
      freeUntilDaysBefore: form.freeUntilDaysBefore,
      penaltyPercent: form.penaltyPercent,
      depositPercent: form.depositPercent,
      customText: form.customText || undefined,
    };
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/cancellation-rules`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({
        color: "green",
        message: editingId ? "Kural güncellendi." : "Kural eklendi.",
      });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydedilemedi." });
    }
  }

  async function removeRule(id: string) {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/cancellation-rules`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if ((await res.json()).ok) void reload();
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Kural ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>Özet</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rules.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed" size="sm" py="sm">
                    İptal kuralı yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rules.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.name}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatCancellationRuleSummary(r)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button size="xs" variant="light" onClick={() => openEdit(r)}>
                      <IconPencil size={14} />
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => removeRule(r.id)}>
                      <IconTrash size={14} />
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
        title={editingId ? "İptal kuralını düzenle" : "Yeni iptal kuralı"}
      >
        <Stack gap="sm">
          <TextInput
            label="Ad"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <NumberInput
            label="Ücretsiz iptal (girişten kaç gün önce)"
            min={0}
            max={365}
            value={form.freeUntilDaysBefore ?? ""}
            onChange={(v) =>
              setForm({ ...form, freeUntilDaysBefore: v === "" ? null : Number(v) })
            }
          />
          <NumberInput
            label="İptal cezası (%)"
            min={0}
            max={100}
            value={form.penaltyPercent ?? ""}
            onChange={(v) => setForm({ ...form, penaltyPercent: v === "" ? null : Number(v) })}
          />
          <NumberInput
            label="Depozito (%)"
            min={0}
            max={100}
            value={form.depositPercent ?? ""}
            onChange={(v) => setForm({ ...form, depositPercent: v === "" ? null : Number(v) })}
          />
          <Textarea
            label="Özel metin"
            value={form.customText}
            onChange={(e) => setForm({ ...form, customText: e.currentTarget.value })}
          />
          <Button onClick={save}>Kaydet</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
