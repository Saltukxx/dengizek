"use client";

// ---------------------------------------------------------------------------
// Kullanıcı yönetimi — oluştur, aktif/pasif, otele ata
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBuildingPlus, IconPlus } from "@tabler/icons-react";
import { memberRoleLabels, userRoleLabels } from "@/lib/labels";

interface Membership {
  hotelId: string;
  role: "owner" | "editor";
  hotelName: string;
  hotelSlug: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager";
  isActive: boolean;
  memberships: Membership[];
}

interface HotelOption {
  id: string;
  name: string;
}

export function UsersTable() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [assigning, setAssigning] = useState<AdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "manager" as "admin" | "manager", password: "" });
  const [busy, setBusy] = useState(false);

  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    role: "manager" as "admin" | "manager",
    password: "",
  });
  const [assignHotelId, setAssignHotelId] = useState<string | null>(null);
  const [assignRole, setAssignRole] = useState<"owner" | "editor">("editor");

  const reload = useCallback(async () => {
    const [usersRes, hotelsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/hotels"),
    ]);
    const usersJson = await usersRes.json();
    const hotelsJson = await hotelsRes.json();
    if (usersJson.ok) setUsers(usersJson.users);
    if (hotelsJson.ok) setHotels(hotelsJson.hotels);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!users) return <Loader />;

  async function createUser() {
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Kullanıcı oluşturuldu." });
      setCreateOpen(false);
      setNewUser({ email: "", name: "", role: "manager", password: "" });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Oluşturma başarısız oldu." });
    }
  }

  async function toggleActive(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    if ((await res.json()).ok) void reload();
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    const payload: Record<string, string> = { name: editForm.name, role: editForm.role };
    if (editForm.password.trim()) payload.password = editForm.password;
    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if ((await res.json()).ok) {
      setEditing(null);
      void reload();
    }
  }

  async function removeMembership(userId: string, hotelId: string) {
    await fetch(`/api/admin/users/${userId}/memberships`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId }),
    });
    void reload();
  }

  async function assign() {
    if (!assigning || !assignHotelId) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${assigning.id}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: assignHotelId, role: assignRole }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Üyelik atandı." });
      setAssigning(null);
      setAssignHotelId(null);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Atama başarısız oldu." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Yeni kullanıcı
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kullanıcı</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Tesisler</Table.Th>
              <Table.Th>Aktif</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <Text fw={500}>{u.name}</Text>
                  <Text size="xs" c="dimmed">
                    {u.email}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={u.role === "admin" ? "grape" : "blue"}>
                    {userRoleLabels[u.role]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {u.memberships.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      —
                    </Text>
                  ) : (
                    <Stack gap={2}>
                      {u.memberships.map((m) => (
                        <Group gap={4} key={m.hotelId}>
                          <Text size="xs">
                            {m.hotelName}{" "}
                            <Text span c="dimmed">
                              ({memberRoleLabels[m.role]})
                            </Text>
                          </Text>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="red"
                            onClick={() => removeMembership(u.id, m.hotelId)}
                          >
                            Kaldır
                          </Button>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Table.Td>
                <Table.Td>
                  <Switch checked={u.isActive} onChange={() => toggleActive(u)} />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <Button size="xs" variant="light" onClick={() => {
                      setEditing(u);
                      setEditForm({ name: u.name, role: u.role, password: "" });
                    }}>
                      Düzenle
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconBuildingPlus size={14} />}
                      onClick={() => setAssigning(u)}
                    >
                      Otele ata
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni kullanıcı">
        <Stack gap="sm">
          <TextInput
            label="Ad soyad"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.currentTarget.value })}
          />
          <TextInput
            label="E-posta"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.currentTarget.value })}
          />
          <Select
            label="Rol"
            data={[
              { value: "manager", label: userRoleLabels.manager },
              { value: "admin", label: userRoleLabels.admin },
            ]}
            value={newUser.role}
            onChange={(v) => v && setNewUser({ ...newUser, role: v as "admin" | "manager" })}
          />
          <PasswordInput
            label="Geçici şifre"
            description="En az 8 karakter — kullanıcıya iletin"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.currentTarget.value })}
          />
          <Button loading={busy} onClick={createUser}>
            Oluştur
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={assigning !== null}
        onClose={() => setAssigning(null)}
        title={`Otele ata — ${assigning?.name ?? ""}`}
      >
        <Stack gap="sm">
          <Select
            label="Tesis"
            data={hotels.map((h) => ({ value: h.id, label: h.name }))}
            value={assignHotelId}
            onChange={setAssignHotelId}
            searchable
          />
          <Select
            label="Üyelik rolü"
            data={[
              { value: "editor", label: memberRoleLabels.editor },
              { value: "owner", label: memberRoleLabels.owner },
            ]}
            value={assignRole}
            onChange={(v) => v && setAssignRole(v as "owner" | "editor")}
          />
          <Button loading={busy} disabled={!assignHotelId} onClick={assign}>
            Ata
          </Button>
        </Stack>
      </Modal>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={`Düzenle — ${editing?.email ?? ""}`}>
        <Stack gap="sm">
          <TextInput label="Ad" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.currentTarget.value })} />
          <Select
            label="Platform rolü"
            data={[
              { value: "manager", label: userRoleLabels.manager },
              { value: "admin", label: userRoleLabels.admin },
            ]}
            value={editForm.role}
            onChange={(v) => v && setEditForm({ ...editForm, role: v as "admin" | "manager" })}
          />
          <PasswordInput
            label="Yeni şifre (opsiyonel)"
            value={editForm.password}
            onChange={(e) => setEditForm({ ...editForm, password: e.currentTarget.value })}
          />
          <Button loading={busy} onClick={saveEdit}>
            Kaydet
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
