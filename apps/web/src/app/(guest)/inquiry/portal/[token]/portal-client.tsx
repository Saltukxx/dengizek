"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Rating,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconStar } from "@tabler/icons-react";

interface MessageRow {
  id: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: "beklemede" | "yayinda" | "reddedildi";
  reply: string | null;
}

const reviewStatusText: Record<ReviewRow["status"], string> = {
  beklemede: "Yorumunuz inceleniyor — onaylandıktan sonra tesis sayfasında görünecek.",
  yayinda: "Yorumunuz yayında.",
  reddedildi: "Yorumunuz yayınlanmadı.",
};

export function InquiryPortalClient({ token }: { token: string }) {
  const [inquiry, setInquiry] = useState<{ name: string; status: string; hotelSlug: string | null } | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 0, title: "", body: "" });
  const [sendingReview, setSendingReview] = useState(false);

  const reload = useCallback(async () => {
    const [msgRes, reviewRes] = await Promise.all([
      fetch(`/api/inquiry/portal/${token}/messages`),
      fetch(`/api/inquiry/portal/${token}/review`),
    ]);
    const json = await msgRes.json();
    if (json.ok) {
      setInquiry(json.inquiry);
      setMessages(json.messages);
      setError(null);
    } else {
      setError(json.error ?? "Bağlantı geçersiz.");
    }
    const reviewJson = await reviewRes.json();
    if (reviewJson.ok) {
      setReview(reviewJson.review);
      setCanReview(reviewJson.canReview);
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

  async function sendReview() {
    if (reviewForm.rating < 1 || !reviewForm.body.trim()) return;
    setSendingReview(true);
    const res = await fetch(`/api/inquiry/portal/${token}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: reviewForm.rating,
        title: reviewForm.title.trim() || undefined,
        body: reviewForm.body,
      }),
    });
    const json = await res.json();
    setSendingReview(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Yorumunuz alındı — inceleme sonrası yayınlanacak." });
      setReviewForm({ rating: 0, title: "", body: "" });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Yorum gönderilemedi." });
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

      {canReview && (
        <Paper withBorder p="md" radius="md">
          <Group gap="xs" mb="sm">
            <IconStar size={18} />
            <Title order={4}>Konaklamanızı değerlendirin</Title>
          </Group>

          {review ? (
            <Stack gap="xs">
              <Group gap="sm">
                <Rating value={review.rating} readOnly />
                <Badge
                  color={
                    review.status === "yayinda"
                      ? "green"
                      : review.status === "reddedildi"
                        ? "red"
                        : "yellow"
                  }
                >
                  {reviewStatusText[review.status]}
                </Badge>
              </Group>
              {review.title && <Text fw={500}>{review.title}</Text>}
              <Text size="sm">{review.body}</Text>
              {review.reply && (
                <Paper p="sm" radius="md" bg="gray.0">
                  <Text size="xs" c="dimmed" mb={4}>
                    Tesisin yanıtı
                  </Text>
                  <Text size="sm">{review.reply}</Text>
                </Paper>
              )}
            </Stack>
          ) : (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Yorumunuz tesis sayfasında &quot;doğrulanmış misafir&quot; olarak gösterilir.
                Yayınlanmadan önce incelenir.
              </Text>
              <Rating
                value={reviewForm.rating}
                onChange={(rating) => setReviewForm({ ...reviewForm, rating })}
                size="lg"
              />
              <TextInput
                label="Başlık (opsiyonel)"
                value={reviewForm.title}
                onChange={(e) => setReviewForm({ ...reviewForm, title: e.currentTarget.value })}
              />
              <Textarea
                label="Yorumunuz"
                minRows={3}
                value={reviewForm.body}
                onChange={(e) => setReviewForm({ ...reviewForm, body: e.currentTarget.value })}
              />
              <Button
                onClick={sendReview}
                loading={sendingReview}
                disabled={reviewForm.rating < 1 || reviewForm.body.trim().length === 0}
              >
                Yorumu gönder
              </Button>
            </Stack>
          )}
        </Paper>
      )}
    </Stack>
  );
}
