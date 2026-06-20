"use client";

// ---------------------------------------------------------------------------
// Admin tesis detayı — bilgiler, üyeler, turlar, moderasyon
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
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconCheck,
  IconExternalLink,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import {
  memberRoleLabels,
  moderationStatusColors,
  moderationStatusLabels,
} from "@/lib/labels";

interface HotelDetail {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  submittedAt: string | null;
  imageUrl: string | null;
  shortDescription: string | null;
}

interface Member {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "editor";
  isActive: boolean;
}

interface TourSummary {
  id: string;
  tourId: string;
  title: string;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  version: number;
}

export function HotelDetailPanel({ hotelId }: { hotelId: string }) {
  const [hotel, setHotel] = useState<HotelDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tours, setTours] = useState<TourSummary[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/hotels/${hotelId}`);
    const json = await res.json();
    if (json.ok) {
      setHotel(json.hotel);
      setMembers(json.members);
      setTours(json.tours);
    }
  }, [hotelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!hotel) return <Loader />;

  const resolvedHotelId = hotel.id;

  async function moderate(karar: "onayla" | "reddet", not?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${resolvedHotelId}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karar, not }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: karar === "onayla" ? "green" : "orange",
        message: karar === "onayla" ? "Tesis yayına alındı." : "Tesis reddedildi.",
      });
      setRejectOpen(false);
      setRejectNote("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="sm">
          <Button
            component={Link}
            href="/admin/hotels"
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
          >
            Otellere dön
          </Button>
          <Title order={2}>{hotel.name}</Title>
          <Badge color={moderationStatusColors[hotel.status]}>
            {moderationStatusLabels[hotel.status]}
          </Badge>
        </Group>
        <Group gap="xs">
          {hotel.status === "yayinda" && (
            <Button
              component={Link}
              href={`/hotels/${hotel.slug}`}
              target="_blank"
              variant="default"
              size="sm"
              leftSection={<IconExternalLink size={14} />}
            >
              Misafir sayfası
            </Button>
          )}
          {hotel.status === "incelemede" && (
            <>
              <Button
                size="sm"
                color="green"
                variant="light"
                leftSection={<IconCheck size={14} />}
                loading={busy}
                onClick={() => moderate("onayla")}
              >
                Onayla
              </Button>
              <Button
                size="sm"
                color="red"
                variant="light"
                leftSection={<IconX size={14} />}
                onClick={() => setRejectOpen(true)}
              >
                Reddet
              </Button>
            </>
          )}
        </Group>
      </Group>

      {hotel.status === "reddedildi" && hotel.moderationNote && (
        <Paper withBorder p="md" radius="md" bg="red.0">
          <Text size="sm" c="red">
            Red nedeni: {hotel.moderationNote}
          </Text>
        </Paper>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text fw={600}>Tesis bilgisi</Text>
          <Text size="sm" c="dimmed">
            {hotel.slug} — {[hotel.city, hotel.country].filter(Boolean).join(", ") || "Konum belirtilmemiş"}
          </Text>
          {hotel.shortDescription && <Text size="sm">{hotel.shortDescription}</Text>}
        </Stack>
      </Paper>

      <Paper withBorder radius="md">
        <Group justify="space-between" p="md" pb={0}>
          <Text fw={600}>Üyeler ({members.length})</Text>
          <Button
            component={Link}
            href="/admin/users"
            size="xs"
            variant="default"
            leftSection={<IconUserPlus size={14} />}
          >
            Kullanıcı ata
          </Button>
        </Group>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kullanıcı</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Aktif</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz üye atanmamış.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {members.map((m) => (
              <Table.Tr key={m.userId}>
                <Table.Td>
                  <Text fw={500}>{m.name}</Text>
                  <Text size="xs" c="dimmed">
                    {m.email}
                  </Text>
                </Table.Td>
                <Table.Td>{memberRoleLabels[m.role]}</Table.Td>
                <Table.Td>
                  <Badge color={m.isActive ? "green" : "gray"} variant="light">
                    {m.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={async () => {
                      await fetch(`/api/admin/users/${m.userId}/memberships`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ hotelId }),
                      });
                      void reload();
                    }}
                  >
                    Kaldır
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder radius="md">
        <Group justify="space-between" p="md" pb={0}>
          <Text fw={600}>Turlar ({tours.length})</Text>
          <Button component={Link} href="/admin/moderation" size="xs" variant="default">
            Tur moderasyonu
          </Button>
        </Group>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tur</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Sürüm</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tours.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz tur yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {tours.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>
                  <Text fw={500}>{t.title}</Text>
                  <Text size="xs" c="dimmed">
                    {t.tourId}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={moderationStatusColors[t.status]}>
                    {moderationStatusLabels[t.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>v{t.version}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={rejectOpen} onClose={() => setRejectOpen(false)} title="Tesis reddet">
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
            onClick={() => moderate("reddet", rejectNote)}
          >
            Reddet
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
