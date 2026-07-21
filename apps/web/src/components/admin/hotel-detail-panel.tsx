"use client";

// ---------------------------------------------------------------------------
// Admin tesis detayı — bilgiler, üyeler, turlar, moderasyon
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
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
  IconBan,
  IconCheck,
  IconExternalLink,
  IconPlayerPlay,
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
  submittedRevision: number | null;
  imageUrl: string | null;
  shortDescription: string | null;
  publishedRevision: number | null;
  draftRevision: number;
  hasUnpublishedChanges: boolean;
  suspendedAt: string | null;
  suspensionNote: string | null;
}

interface PreviewDiff {
  submittedRevision: number;
  publishedRevision: number | null;
  diff: {
    changedFields: string[];
    collections: Record<string, { previous: number; submitted: number; added: string[]; removed: string[]; changed: string[] }>;
    readiness: { missingRequiredFields: string[]; mediaNotReady: number; ready: boolean };
  };
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
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendNote, setSuspendNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewDiff | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/hotels/${hotelId}`);
    const json = await res.json();
    if (json.ok) {
      setHotel(json.hotel);
      setMembers(json.members);
      setTours(json.tours);
      if (json.hotel.submittedRevision) {
        const previewRes = await fetch(`/api/admin/hotels/${hotelId}/submitted-preview`);
        const previewJson = await previewRes.json();
        setPreview(previewJson.ok ? previewJson : null);
      } else {
        setPreview(null);
      }
    }
  }, [hotelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!hotel) return <Loader />;

  const resolvedHotelId = hotel.id;
  const submittedRevision = hotel.submittedRevision;

  async function moderate(karar: "onayla" | "reddet", not?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${resolvedHotelId}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karar, not, submittedRevision }),
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

  async function suspend(note: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${resolvedHotelId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suspend", note }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "orange", message: "Tesis askıya alındı — misafir tarafında gizlendi." });
      setSuspendOpen(false);
      setSuspendNote("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  async function unsuspend() {
    setBusy(true);
    const res = await fetch(`/api/admin/hotels/${resolvedHotelId}/suspend`, {
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
          {hotel.suspendedAt && (
            <Badge color="dark" variant="filled">
              Askıya alındı
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          {hotel.status === "yayinda" && !hotel.suspendedAt && (
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
          {hotel.suspendedAt ? (
            <Button
              size="sm"
              color="green"
              variant="light"
              leftSection={<IconPlayerPlay size={14} />}
              loading={busy}
              onClick={() => void unsuspend()}
            >
              Askıyı kaldır
            </Button>
          ) : (
            <Button
              size="sm"
              color="dark"
              variant="light"
              leftSection={<IconBan size={14} />}
              onClick={() => setSuspendOpen(true)}
            >
              Askıya al
            </Button>
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

      {hotel.suspendedAt && (
        <Paper withBorder p="md" radius="md" bg="dark.0">
          <Text size="sm">
            Askıya alma nedeni: {hotel.suspensionNote ?? "—"}
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

      {preview && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Gönderilmiş sürüm karşılaştırması</Text>
              <Group gap="xs">
                <Badge variant="light" color="gray">Yayın v{preview.publishedRevision ?? "—"}</Badge>
                <Badge variant="light" color="violet">Gönderilen v{preview.submittedRevision}</Badge>
                <Badge color={preview.diff.readiness.ready ? "green" : "orange"}>
                  {preview.diff.readiness.ready ? "Yayına hazır" : "Eksikleri var"}
                </Badge>
              </Group>
            </Group>
            <Text size="sm">
              Değişen tesis alanları: {preview.diff.changedFields.length ? preview.diff.changedFields.join(", ") : "Yok"}
            </Text>
            {Object.entries(preview.diff.collections).map(([key, value]) => (
              <Text size="sm" key={key}>
                {key}: {value.previous} → {value.submitted}
                {value.added.length > 0 ? ` · Eklenen: ${value.added.join(", ")}` : ""}
                {value.removed.length > 0 ? ` · Silinen: ${value.removed.join(", ")}` : ""}
                {value.changed.length > 0 ? ` · Değişen: ${value.changed.join(", ")}` : ""}
              </Text>
            ))}
            {!preview.diff.readiness.ready && (
              <Alert color="orange" title="Yayın öncesi kontrol">
                {preview.diff.readiness.missingRequiredFields.length > 0
                  ? `Eksik zorunlu alanlar: ${preview.diff.readiness.missingRequiredFields.join(", ")}. `
                  : ""}
                {preview.diff.readiness.mediaNotReady > 0
                  ? `${preview.diff.readiness.mediaNotReady} içerikte görsel eksik.`
                  : ""}
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

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

      <Modal opened={suspendOpen} onClose={() => setSuspendOpen(false)} title="Tesisi askıya al">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Tesis, moderasyon durumundan bağımsız olarak misafir tarafında anında gizlenir.
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
            onClick={() => suspend(suspendNote)}
          >
            Askıya al
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
