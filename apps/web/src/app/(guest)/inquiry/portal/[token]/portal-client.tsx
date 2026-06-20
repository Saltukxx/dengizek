"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle } from "@tabler/icons-react";

interface MessageRow {
  id: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string | null;
  body: string;
  createdAt: string;
}

export function InquiryPortalClient({ token }: { token: string }) {
  const [inquiry, setInquiry] = useState<{ name: string; status: string; hotelSlug: string | null } | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/inquiry/portal/${token}/messages`);
    const json = await res.json();
    if (json.ok) {
      setInquiry(json.inquiry);
      setMessages(json.messages);
      setError(null);
    } else {
      setError(json.error ?? "Bağlantı geçersiz.");
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function sendMessage() {
    if (!body.trim()) return;
    const res = await fetch(`/api/inquiry/portal/${token}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json();
    if (json.ok) {
      setBody("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderilemedi." });
    }
  }

  if (!messages) return <Loader />;

  if (error) {
    return (
      <Stack maw={640} mx="auto" py="xl" px="md">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack maw={640} mx="auto" py="xl" px="md" gap="md">
      <div>
        <Title order={2}>Talep mesajları</Title>
        <Text c="dimmed" size="sm">
          Merhaba {inquiry?.name} — tesisinizle yazışmalarınız
        </Text>
      </div>
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          {messages.length === 0 && (
            <Text c="dimmed" size="sm">
              Henüz mesaj yok. Aşağıdan yazabilirsiniz.
            </Text>
          )}
          {messages.map((m) => (
            <Paper
              key={m.id}
              p="sm"
              radius="md"
              bg={m.senderRole === "guest" ? "indigo.0" : "gray.0"}
            >
              <Text size="xs" c="dimmed" mb={4}>
                {m.senderRole === "guest" ? "Siz" : m.senderName ?? "Tesis"} —{" "}
                {new Date(m.createdAt).toLocaleString("tr-TR")}
              </Text>
              <Text size="sm">{m.body}</Text>
            </Paper>
          ))}
        </Stack>
      </Paper>
      <Textarea
        label="Mesajınız"
        minRows={3}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
      />
      <Button onClick={sendMessage}>Gönder</Button>
    </Stack>
  );
}
