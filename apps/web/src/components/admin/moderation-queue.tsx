"use client";

// ---------------------------------------------------------------------------
// Tur inceleme kuyruğu — onayla (yayın snapshot'ı) / reddet (not zorunlu)
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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconExternalLink, IconEye, IconTrash, IconX } from "@tabler/icons-react";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";

interface AdminTour {
  id: string;
  tourId: string;
  title: string;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  version: number;
  submittedAt: string | null;
  submittedRevision: number | null;
  publishedAt: string | null;
  hotelSlug: string;
  hotelName: string;
}

/** /api/admin/tours/[id]/submitted-preview yanıtı — onaylanacak snapshot. */
interface SubmittedStep {
  stepId: string;
  order: number;
  kind: string;
  title: string;
  body?: string;
  media: { mode: string; src: string; startSec?: number; endSec?: number };
  callouts?: unknown[];
  hotspots?: unknown[];
  branches?: { label: string; nextStepId: string }[];
}

export function ModerationQueue() {
  const [tours, setTours] = useState<AdminTour[] | null>(null);
  const [rejecting, setRejecting] = useState<AdminTour | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<AdminTour | null>(null);
  const [previewSteps, setPreviewSteps] = useState<SubmittedStep[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/tours");
    const json = await res.json();
    if (json.ok) setTours(json.tours);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!tours) return <Loader />;

  async function deleteTour(t: AdminTour) {
    if (
      !confirm(
        `"${t.title}" turunu kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/tours/${t.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Tur silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  /**
   * Onaylanacak snapshot'ı gösterir. Public /tours/... sayfası publishedManifest
   * okuduğu için incelemedeki içeriği GÖSTERMEZ (404 ya da eski sürüm) — admin
   * onayladığı şeyi görebilsin diye submitted-preview kullanılır.
   */
  async function openPreview(tour: AdminTour) {
    setPreviewing(tour);
    setPreviewSteps(null);
    setPreviewError(null);
    const res = await fetch(`/api/admin/tours/${tour.id}/submitted-preview`);
    const json = await res.json();
    if (json.ok) {
      setPreviewSteps([...(json.manifest.steps as SubmittedStep[])].sort((a, b) => a.order - b.order));
    } else {
      setPreviewError(json.error ?? "Gönderilen sürüm okunamadı.");
    }
  }

  async function decide(tour: AdminTour, karar: "onayla" | "reddet", not?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/tours/${tour.id}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karar, not, submittedRevision: tour.submittedRevision }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: karar === "onayla" ? "green" : "orange",
        message:
          karar === "onayla"
            ? `Tur yayına alındı (v${json.version}).`
            : "Tur reddedildi.",
      });
      setRejecting(null);
      setRejectNote("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız oldu." });
    }
  }

  const pending = tours.filter((t) => t.status === "incelemede");
  const others = tours.filter((t) => t.status !== "incelemede");

  function renderRows(rows: AdminTour[]) {
    return rows.map((t) => (
      <Table.Tr key={t.id}>
        <Table.Td>
          <Text fw={500}>{t.title}</Text>
          <Text size="xs" c="dimmed">
            {t.hotelName} — {t.tourId}
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge color={moderationStatusColors[t.status]}>
            {moderationStatusLabels[t.status]}
          </Badge>
        </Table.Td>
        <Table.Td>v{t.version}</Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end">
            {t.status === "incelemede" && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconEye size={14} />}
                onClick={() => openPreview(t)}
              >
                Gönderileni incele
              </Button>
            )}
            {t.publishedAt !== null && (
              <Button
                size="xs"
                variant="subtle"
                component={Link}
                href={`/tours/${t.hotelSlug}/${t.tourId}`}
                target="_blank"
                leftSection={<IconExternalLink size={14} />}
              >
                Yayındakini aç
              </Button>
            )}
            {t.status === "incelemede" && (
              <>
                <Button
                  size="xs"
                  color="green"
                  variant="light"
                  leftSection={<IconCheck size={14} />}
                  loading={busy}
                  onClick={() => decide(t, "onayla")}
                >
                  Onayla
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<IconX size={14} />}
                  onClick={() => setRejecting(t)}
                >
                  Reddet
                </Button>
              </>
            )}
            <Button
              size="xs"
              color="red"
              variant="subtle"
              leftSection={<IconTrash size={14} />}
              loading={busy}
              onClick={() => deleteTour(t)}
            >
              Sil
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    ));
  }

  return (
    <Stack gap="md">
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tur</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Sürüm</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tours.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz tur yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {renderRows(pending)}
            {renderRows(others)}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal
        opened={previewing !== null}
        onClose={() => setPreviewing(null)}
        title={`Gönderilen sürüm — ${previewing?.title ?? ""}`}
        size="lg"
      >
        {previewError && <Alert color="red">{previewError}</Alert>}
        {!previewError && !previewSteps && <Loader />}
        {previewSteps && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {previewSteps.length} adım · onaylandığında misafirlerin göreceği içerik bu.
            </Text>
            {previewSteps.map((s) => (
              <Paper key={s.stepId} withBorder p="sm" radius="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={500} size="sm">
                      {s.order + 1}. {s.title}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {s.stepId} · {s.kind}
                    </Text>
                  </div>
                  <Group gap={4}>
                    <Badge size="sm" variant="light">{s.media.mode}</Badge>
                    {(s.callouts?.length ?? 0) > 0 && (
                      <Badge size="sm" variant="light" color="grape">
                        {s.callouts?.length} baloncuk
                      </Badge>
                    )}
                    {(s.hotspots?.length ?? 0) > 0 && (
                      <Badge size="sm" variant="light" color="cyan">
                        {s.hotspots?.length} nokta
                      </Badge>
                    )}
                    {(s.branches?.length ?? 0) > 0 && (
                      <Badge size="sm" variant="light" color="orange">
                        {s.branches?.length} dal
                      </Badge>
                    )}
                  </Group>
                </Group>
                {s.body && (
                  <Text size="xs" mt={4}>
                    {s.body}
                  </Text>
                )}
                <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: "break-all" }}>
                  {s.media.src}
                </Text>
              </Paper>
            ))}
          </Stack>
        )}
      </Modal>

      <Modal
        opened={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={`Reddet — ${rejecting?.title ?? ""}`}
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
    </Stack>
  );
}
