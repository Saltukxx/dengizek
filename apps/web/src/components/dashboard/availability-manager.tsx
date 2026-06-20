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

interface NoteRow {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  isBlackout: boolean;
}

export function AvailabilityManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", startDate: "", endDate: "", isBlackout: false });

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/availability-notes`);
    const json = await res.json();
    if (json.ok) setNotes(json.notes);
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
  if (!hotel || !notes) return <Loader />;

  async function createNote() {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/availability-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isBlackout: form.isBlackout,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Not eklendi." });
      setOpen(false);
      setForm({ label: "", startDate: "", endDate: "", isBlackout: false });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Eklenemedi." });
    }
  }

  async function removeNote(id: string) {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/availability-notes`, {
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
          Not ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Etiket</Table.Th>
              <Table.Th>Tarih aralığı</Table.Th>
              <Table.Th>Tür</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {notes.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Müsaitlik notu yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {notes.map((n) => (
              <Table.Tr key={n.id}>
                <Table.Td>{n.label}</Table.Td>
                <Table.Td>
                  {n.startDate ?? "—"} — {n.endDate ?? "—"}
                </Table.Td>
                <Table.Td>
                  <Badge color={n.isBlackout ? "red" : "blue"}>
                    {n.isBlackout ? "Kapalı dönem" : "Bilgi"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button size="xs" color="red" variant="light" onClick={() => removeNote(n.id)}>
                    Sil
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="Müsaitlik notu">
        <Stack gap="sm">
          <TextInput label="Etiket" value={form.label} onChange={(e) => setForm({ ...form, label: e.currentTarget.value })} />
          <TextInput label="Başlangıç" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} />
          <TextInput label="Bitiş" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} />
          <Switch label="Kapalı dönem (blackout)" checked={form.isBlackout} onChange={(e) => setForm({ ...form, isBlackout: e.currentTarget.checked })} />
          <Button onClick={createNote}>Kaydet</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
