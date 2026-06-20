"use client";

// ---------------------------------------------------------------------------
// Tur inceleme kuyruğu — onayla (yayın snapshot'ı) / reddet (not zorunlu)
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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";

interface AdminTour {
  id: string;
  tourId: string;
  title: string;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  version: number;
  submittedAt: string | null;
  publishedAt: string | null;
  hotelSlug: string;
  hotelName: string;
}

export function ModerationQueue() {
  const [tours, setTours] = useState<AdminTour[] | null>(null);
  const [rejecting, setRejecting] = useState<AdminTour | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/tours");
    const json = await res.json();
    if (json.ok) setTours(json.tours);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!tours) return <Loader />;

  async function decide(tour: AdminTour, karar: "onayla" | "reddet", not?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/tours/${tour.id}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karar, not }),
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
            <Button
              size="xs"
              variant="default"
              component={Link}
              href={`/tours/${t.hotelSlug}/${t.tourId}`}
              target="_blank"
              leftSection={<IconExternalLink size={14} />}
            >
              Önizle
            </Button>
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
