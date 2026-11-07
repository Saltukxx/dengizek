"use client";

// ---------------------------------------------------------------------------
// Mesaj onay kuyruğu — onay bekleyen talep/mesajlar; onayla veya reddet.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconInbox, IconX } from "@tabler/icons-react";

interface QueueItem {
  kind: "inquiry" | "message";
  id: string;
  hotelName: string;
  direction: "guest" | "hotel";
  senderLabel: string;
  body: string;
  createdAt: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MessageReviewQueue() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/message-review");
      const json = await res.json();
      if (json.ok) setItems(json.items);
      else setError(json.error ?? "Kuyruk yüklenemedi.");
    } catch {
      setError("Kuyruk yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(item: QueueItem, action: "approve" | "reject", rejectReason?: string) {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin/message-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id, action, reason: rejectReason }),
      });
      const json = await res.json();
      if (json.ok) {
        notifications.show({
          color: action === "approve" ? "green" : "orange",
          message: action === "approve" ? "Onaylandı ve iletildi." : "Reddedildi.",
        });
        setRejecting(null);
        setReason("");
        setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
      } else {
        notifications.show({ color: "red", message: json.error ?? "İşlem başarısız." });
      }
    } catch {
      notifications.show({ color: "red", message: "İşlem başarısız." });
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return (
      <Alert color="red" title="Hata">
        {error}
        <Button mt="sm" size="xs" variant="light" onClick={() => void reload()}>
          Tekrar dene
        </Button>
      </Alert>
    );
  }
  if (!items) return <Loader />;

  if (items.length === 0) {
    return (
      <Paper withBorder radius="md" p="xl">
        <Stack align="center" gap="xs">
          <IconInbox size={32} opacity={0.4} />
          <Text c="dimmed">Onay bekleyen mesaj yok.</Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {items.length} öğe onay bekliyor
      </Text>
      {items.map((item) => {
        const fromGuest = item.direction === "guest";
        return (
          <Paper key={item.id} withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Badge color={fromGuest ? "blue" : "indigo"} variant="light">
                    {fromGuest ? "Misafir → Tesis" : "Tesis → Misafir"}
                  </Badge>
                  {item.kind === "inquiry" && (
                    <Badge color="grape" variant="light">
                      İlk talep
                    </Badge>
                  )}
                  <Text size="sm" fw={600}>
                    {item.hotelName}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {formatWhen(item.createdAt)}
                </Text>
              </Group>

              <Text size="xs" c="dimmed">
                Gönderen: {item.senderLabel}
              </Text>
              <Paper bg="var(--mantine-color-gray-0)" p="sm" radius="sm">
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {item.body}
                </Text>
              </Paper>

              {rejecting === item.id ? (
                <Stack gap="xs">
                  <Textarea
                    label="Red nedeni (isteğe bağlı, yalnız kayıt için)"
                    placeholder="Örn. uygunsuz içerik / iletişim bilgisi paylaşımı"
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                    autosize
                    minRows={2}
                    maxRows={4}
                  />
                  <Group gap="xs">
                    <Button
                      color="red"
                      size="xs"
                      loading={busyId === item.id}
                      onClick={() => void act(item, "reject", reason.trim() || undefined)}
                    >
                      Reddet
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                    >
                      Vazgeç
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Group gap="xs">
                  <Button
                    color="green"
                    size="xs"
                    leftSection={<IconCheck size={14} />}
                    loading={busyId === item.id}
                    onClick={() => void act(item, "approve")}
                  >
                    Onayla ve ilet
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    size="xs"
                    leftSection={<IconX size={14} />}
                    disabled={busyId === item.id}
                    onClick={() => {
                      setRejecting(item.id);
                      setReason("");
                    }}
                  >
                    Reddet
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
