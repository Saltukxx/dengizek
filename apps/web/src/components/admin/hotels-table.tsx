"use client";

// ---------------------------------------------------------------------------
// Admin otel tablosu — listele, oluştur, onayla/reddet
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBan, IconCheck, IconPlayerPlay, IconPlus, IconX } from "@tabler/icons-react";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";

interface AdminHotel {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  submittedAt: string | null;
  submittedRevision: number | null;
  suspendedAt: string | null;
}

export function HotelsTable() {
  const [hotels, setHotels] = useState<AdminHotel[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [rejecting, setRejecting] = useState<AdminHotel | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [suspending, setSuspending] = useState<AdminHotel | null>(null);
  const [suspendNote, setSuspendNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/hotels");
    const json = await res.json();
    if (json.ok) setHotels(json.hotels);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!hotels) return <Loader />;

  async function decide(hotel: AdminHotel, karar: "onayla" | "reddet", not?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${hotel.id}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karar, not, submittedRevision: hotel.submittedRevision }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: karar === "onayla" ? "green" : "orange",
        message: karar === "onayla" ? "Tesis yayına alındı." : "Tesis reddedildi.",
      });
      setRejecting(null);
      setRejectNote("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  async function suspend(hotel: AdminHotel, note: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${hotel.id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suspend", note }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "orange", message: "Tesis askıya alındı — misafir tarafında gizlendi." });
      setSuspending(null);
      setSuspendNote("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  async function unsuspend(hotel: AdminHotel) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${hotel.id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsuspend" }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Askı kaldırıldı." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  async function createHotel() {
    setBusy(true);
    const res = await fetch("/api/admin/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        city: newCity || undefined,
        country: newCountry || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: "green",
        message: `Tesis oluşturuldu (${json.hotel.slug}).`,
      });
      setCreateOpen(false);
      setNewName("");
      setNewCity("");
      setNewCountry("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Oluşturma başarısız oldu." });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Yeni tesis
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tesis</Table.Th>
              <Table.Th>Konum</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {hotels.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz tesis yok. &quot;Yeni tesis&quot; ile başlayın.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {hotels.map((h) => (
              <Table.Tr key={h.id}>
                <Table.Td>
                  <Text
                    component={Link}
                    href={`/admin/hotels/${h.id}`}
                    fw={500}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {h.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {h.slug}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {[h.city, h.country].filter(Boolean).join(", ") || "—"}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Badge color={moderationStatusColors[h.status]}>
                      {moderationStatusLabels[h.status]}
                    </Badge>
                    {h.suspendedAt && (
                      <Badge color="dark" variant="filled">
                        Askıya alındı
                      </Badge>
                    )}
                  </Group>
                  {h.status === "reddedildi" && h.moderationNote && (
                    <Text size="xs" c="red">
                      {h.moderationNote}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    {h.status === "incelemede" && (
                      <>
                        <Button
                          size="xs"
                          color="green"
                          variant="light"
                          leftSection={<IconCheck size={14} />}
                          loading={busy}
                          onClick={() => decide(h, "onayla")}
                        >
                          Onayla
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          leftSection={<IconX size={14} />}
                          onClick={() => setRejecting(h)}
                        >
                          Reddet
                        </Button>
                      </>
                    )}
                    {h.suspendedAt ? (
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        leftSection={<IconPlayerPlay size={14} />}
                        loading={busy}
                        onClick={() => void unsuspend(h)}
                      >
                        Askıyı kaldır
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        color="dark"
                        variant="light"
                        leftSection={<IconBan size={14} />}
                        onClick={() => setSuspending(h)}
                      >
                        Askıya al
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni tesis oluştur">
        <Stack gap="sm">
          <TextInput
            label="Tesis adı"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <Group grow>
            <TextInput
              label="Şehir"
              value={newCity}
              onChange={(e) => setNewCity(e.currentTarget.value)}
            />
            <TextInput
              label="Ülke"
              value={newCountry}
              onChange={(e) => setNewCountry(e.currentTarget.value)}
            />
          </Group>
          <Button loading={busy} onClick={createHotel}>
            Oluştur
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={`Reddet — ${rejecting?.name ?? ""}`}
      >
        <Stack gap="sm">
          <Textarea
            label="Red nedeni"
            description="Otel yöneticisine gösterilir — zorunlu"
            autosize
            minRows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.currentTarget.value)}
          />
          <Button
            color="red"
            loading={busy}
            disabled={rejectNote.trim().length === 0}
            onClick={() => rejecting && decide(rejecting, "reddet", rejectNote)}
          >
            Reddet
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={suspending !== null}
        onClose={() => setSuspending(null)}
        title={`Askıya al — ${suspending?.name ?? ""}`}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Tesis, moderasyon durumundan bağımsız olarak misafir tarafında anında gizlenir. İptal
            ve rezervasyon akışları etkilenmez; yalnızca listeleme ve keşif kapanır.
          </Text>
          <Textarea
            label="Askıya alma nedeni"
            description="İç kayıt için — zorunlu"
            autosize
            minRows={3}
            value={suspendNote}
            onChange={(e) => setSuspendNote(e.currentTarget.value)}
          />
          <Button
            color="dark"
            loading={busy}
            disabled={suspendNote.trim().length === 0}
            onClick={() => suspending && suspend(suspending, suspendNote)}
          >
            Askıya al
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
