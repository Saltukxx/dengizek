"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { memberRoleLabels } from "@/lib/labels";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";
import { usePanelConfirm } from "./panel-confirm";

interface MemberRow {
  id: string;
  userId: string;
  role: "owner" | "editor";
  email: string;
  name: string;
}

export function TeamManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const { confirm, modal: confirmModal } = usePanelConfirm();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/members`);
    const json = await res.json();
    if (json.ok) {
      setLoadError(null);
      setMembers(json.members);
    } else {
      setLoadError(json.error ?? "Ekip alınamadı.");
      setMembers([]);
    }
  }, [hotel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) {
    return <PanelError message={hotelError} />;
  }
  if (loadError) {
    return <PanelError message={loadError} onRetry={() => void reload()} />;
  }
  if (!hotel || !members) return <PanelLoading />;

  if (hotel.memberRole !== "owner") {
    return (
      <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
        Ekip yönetimi yalnızca tesis sahibi tarafından yapılabilir.
      </Alert>
    );
  }

  async function addMember() {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Üye eklendi." });
      setOpen(false);
      setEmail("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Eklenemedi." });
    }
  }

  async function removeMember(userId: string) {
    const ok = await confirm({
      title: "Üyeyi çıkar",
      message: "Bu üyeyi çıkarmak istediğinize emin misiniz?",
      confirmLabel: "Çıkar",
    });
    if (!ok) return;
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Üye çıkarıldı." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silinemedi." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          Üye ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <ScrollArea type="auto">
        <Table highlightOnHover miw={560}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>E-posta</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <PanelEmpty title="Ekipte üye yok" description="E-posta ile yeni üye ekleyin." />
                </Table.Td>
              </Table.Tr>
            )}
            {members.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.name}</Table.Td>
                <Table.Td>{m.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{memberRoleLabels[m.role]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => removeMember(m.userId)}
                  >
                    Çıkar
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </ScrollArea>
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} title="Üye ekle">
        <Stack gap="sm">
          <TextInput
            label="E-posta"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <Select
            label="Rol"
            data={[
              { value: "editor", label: memberRoleLabels.editor },
              { value: "owner", label: memberRoleLabels.owner },
            ]}
            value={role}
            onChange={(v) => setRole(v ?? "editor")}
          />
          <Button onClick={addMember}>Ekle</Button>
        </Stack>
      </Modal>
      {confirmModal}
    </Stack>
  );
}
