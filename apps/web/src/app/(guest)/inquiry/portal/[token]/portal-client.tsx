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
import { IconAlertCircle, IconShieldLock, IconStar } from "@tabler/icons-react";

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

/**
 * Gövdesi olmayan ya da JSON olmayan yanıtlarda null döner.
 *
 * Uçlar hata durumunda (ör. veritabanına ulaşılamıyor) boş gövdeli 500
 * dönebiliyor; doğrudan res.json() çağrısı o noktada exception atıp
 * bileşeni sonsuz yükleniyor durumunda bırakıyordu.
 */
async function readJson(res: Response): Promise<{ ok?: boolean; error?: string; [key: string]: unknown } | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const GENERIC_ERROR = "Şu anda bağlantı kurulamadı. Lütfen biraz sonra tekrar deneyin.";

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
  const [erasing, setErasing] = useState(false);
  const [erased, setErased] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [msgRes, reviewRes] = await Promise.all([
        fetch(`/api/inquiry/portal/${token}/messages`),
        fetch(`/api/inquiry/portal/${token}/review`),
      ]);
      const json = await readJson(msgRes);
      if (json?.ok) {
        setInquiry(json.inquiry as typeof inquiry);
        setMessages(json.messages as MessageRow[]);
        setError(null);
      } else {
        setError(json?.error ?? GENERIC_ERROR);
        // Yükleniyor durumundan çık: hata ekranı gösterilebilsin.
        setMessages([]);
      }
      const reviewJson = await readJson(reviewRes);
      if (reviewJson?.ok) {
        setReview(reviewJson.review as ReviewRow | null);
        setCanReview(Boolean(reviewJson.canReview));
      }
    } catch {
      // Ağ hatası — fetch'in kendisi reddetti.
      setError(GENERIC_ERROR);
      setMessages([]);
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
    const json = await readJson(res);
    if (json?.ok) {
      setBody("");
      void reload();
    } else {
      notifications.show({ color: "red", message: json?.error ?? "Gönderilemedi." });
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
    const json = await readJson(res);
    setSendingReview(false);
    if (json?.ok) {
      notifications.show({ color: "green", message: "Yorumunuz alındı — inceleme sonrası yayınlanacak." });
      setReviewForm({ rating: 0, title: "", body: "" });
      void reload();
    } else {
      notifications.show({ color: "red", message: json?.error ?? "Yorum gönderilemedi." });
    }
  }

  async function downloadData() {
    const res = await fetch(`/api/inquiry/portal/${token}/data`);
    const json = await readJson(res);
    if (!json?.ok) {
      notifications.show({ color: "red", message: json?.error ?? "Veriler alınamadı." });
      return;
    }
    // Tarayıcıda dosya olarak indir — sunucuda kopya bırakmaya gerek yok.
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dengizek-verilerim.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function eraseData() {
    if (!confirm("Kişisel verileriniz silinsin mi? Bu işlem geri alınamaz ve bu bağlantı geçersiz olur.")) {
      return;
    }
    setErasing(true);
    const res = await fetch(`/api/inquiry/portal/${token}/data`, { method: "POST" });
    const json = await readJson(res);
    setErasing(false);
    if (json?.ok) {
      setErased(true);
    } else {
      notifications.show({ color: "red", message: json?.error ?? "Silinemedi." });
    }
  }

  // Hata, yükleniyor durumundan ÖNCE gelir: istek başarısızsa messages null
  // kalabiliyor ve ekran sonsuz spinner'da takılıyordu.
  if (error) {
    return (
      <Stack maw={640} mx="auto" py="xl" px="md">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
        <Button variant="light" onClick={() => void reload()} style={{ alignSelf: "flex-start" }}>
          Tekrar dene
        </Button>
      </Stack>
    );
  }

  if (!messages) {
    return (
      <Stack maw={640} mx="auto" py="xl" px="md" align="center">
        <Loader />
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

      <Paper withBorder p="md" radius="md">
        <Group gap="xs" mb="sm">
          <IconShieldLock size={18} />
          <Title order={4}>Verileriniz</Title>
        </Group>
        {erased ? (
          <Alert color="green">
            Kişisel verileriniz silindi. Bu bağlantı artık geçersiz.
          </Alert>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Bu talep kapsamında sakladığımız kişisel verileri indirebilir veya
              silinmesini isteyebilirsiniz. Silme sonrası bu portal bağlantısı geçersiz olur;
              tesisin ticari kaydı adınız olmadan saklanmaya devam eder.
            </Text>
            <Group>
              <Button variant="light" onClick={downloadData}>
                Verilerimi indir
              </Button>
              <Button color="red" variant="light" loading={erasing} onClick={eraseData}>
                Verilerimi sil
              </Button>
            </Group>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
