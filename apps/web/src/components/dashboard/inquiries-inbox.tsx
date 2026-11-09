"use client";

// ---------------------------------------------------------------------------
// Talep gelen kutusu — zengin alanlar, kaynak filtresi, mesaj drawer, CSV
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendarPlus, IconDownload, IconLinkOff, IconMessage, IconSearch } from "@tabler/icons-react";
import { inquirySourceLabels, inquiryStatusColors, inquiryStatusLabels } from "@/lib/labels";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";
import { ListPagination } from "./list-pagination";
import { usePanelConfirm } from "./panel-confirm";

interface InquiryRow {
  id: string;
  name: string;
  message: string;
  status: "yeni" | "ilgileniliyor" | "kapatildi";
  source: "web" | "tour_ai" | "tour_player" | "hotel_chat";
  checkIn: string | null;
  checkOut: string | null;
  adults: number | null;
  children: number | null;
  roomSlug: string | null;
  tourId: string | null;
  stepKey: string | null;
  marketingConsent: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string | null;
  body: string;
  approvalStatus?: "bekliyor" | "onaylandi" | "reddedildi";
  createdAt: string;
}

export function InquiriesInbox() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const { confirm, modal: confirmModal } = usePanelConfirm();
  const [inquiries, setInquiries] = useState<InquiryRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 50;
  const [durum, setDurum] = useState<string | null>(null);
  const [kaynak, setKaynak] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");
  const [roomSlugToId, setRoomSlugToId] = useState<Record<string, string>>({});
  const [roomOptions, setRoomOptions] = useState<{ value: string; label: string }[]>([]);
  const [promotionOptions, setPromotionOptions] = useState<{ value: string; label: string; roomIds: string[] }[]>([]);
  // Rezervasyona dönüştürme penceresi: oda, uygulanan kampanya, toplam.
  const [converting, setConverting] = useState<{ inquiry: InquiryRow; roomId: string | null; promotionId: string | null; totalMajor: number | null; busy: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const params = new URLSearchParams({ hotelId: hotel.id, sayfa: String(sayfa) });
    if (durum) params.set("durum", durum);
    if (kaynak) params.set("kaynak", kaynak);
    if (q) params.set("q", q);
    const [inquiriesRes, roomsRes] = await Promise.all([
      fetch(`/api/manager/inquiries?${params}`),
      fetch(`/api/manager/hotels/${hotel.id}/rooms`),
    ]);
    const json = await inquiriesRes.json();
    const roomsJson = await roomsRes.json();
    if (json.ok) {
      setLoadError(null);
      setInquiries(json.inquiries);
      setTotalCount(json.totalCount ?? json.inquiries.length);
      setHasMore(json.hasMore ?? false);
    } else {
      setLoadError(json.error ?? "Talepler alınamadı.");
      setInquiries([]);
    }
    if (roomsJson.ok) {
      const map: Record<string, string> = {};
      for (const r of roomsJson.rooms as { id: string; slug: string }[]) {
        map[r.slug] = r.id;
      }
      setRoomSlugToId(map);
      setRoomOptions((roomsJson.rooms as { id: string; name: string }[]).map((r) => ({ value: r.id, label: r.name })));
    }
  }, [hotel, durum, kaynak, q, sayfa]);

  useEffect(() => {
    setSayfa(1);
  }, [durum, kaynak, q]);

  // Arama her tuşta değil, yazma durunca gider.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openThread(id: string) {
    setThreadId(id);
    const res = await fetch(`/api/manager/inquiries/${id}/messages`);
    const json = await res.json();
    if (json.ok) setMessages(json.messages);
  }

  async function revokePortalLink() {
    if (!threadId) return;
    const ok = await confirm({
      title: "Portal bağlantısını iptal et",
      message: "Misafirin portal bağlantısını hemen iptal etmek istediğinize emin misiniz? Misafir eski linke tekrar erişemez.",
      confirmLabel: "İptal et",
    });
    if (!ok) return;
    const res = await fetch(`/api/manager/inquiries/${threadId}/portal-token`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Portal bağlantısı iptal edildi." });
    } else {
      notifications.show({ color: "red", message: json.error ?? "İptal edilemedi." });
    }
  }

  async function sendReply() {
    if (!threadId || !reply.trim()) return;
    const res = await fetch(`/api/manager/inquiries/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const json = await res.json();
    if (json.ok) {
      setReply("");
      void openThread(threadId);
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderilemedi." });
    }
  }

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) {
    return <PanelError message={hotelError} />;
  }
  if (loadError) {
    return <PanelError message={loadError} onRetry={() => void reload()} />;
  }
  if (!inquiries) return <PanelLoading />;

  async function setStatus(id: string, yeniDurum: InquiryRow["status"]) {
    const res = await fetch(`/api/manager/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum: yeniDurum }),
    });
    const json = await res.json();
    if (json.ok) {
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Güncelleme başarısız oldu." });
    }
  }

  async function openConvert(q: InquiryRow) {
    if (!hotel) return;
    if (!q.checkIn || !q.checkOut) {
      notifications.show({ color: "yellow", message: "Talepte giriş/çıkış tarihi gerekli." });
      return;
    }
    setConverting({ inquiry: q, roomId: q.roomSlug ? roomSlugToId[q.roomSlug] ?? null : null, promotionId: null, totalMajor: null, busy: false });
    // Aktif kampanyalar — kontenjanlı kampanya seçilirse kontenjandan düşer.
    const res = await fetch(`/api/manager/hotels/${hotel.id}/promotions`);
    const json = await res.json().catch(() => ({}));
    if (json.ok) {
      setPromotionOptions(
        (json.promotions as { id: string; name: string; isActive: boolean; roomIds: string[]; allotment: number | null }[])
          .filter((p) => p.isActive)
          .map((p) => ({ value: p.id, label: p.allotment ? `${p.name} (kontenjan ${p.allotment}/gece)` : p.name, roomIds: p.roomIds })),
      );
    }
  }

  async function convertToBooking() {
    if (!hotel || !converting) return;
    const { inquiry: q, roomId, promotionId, totalMajor } = converting;
    setConverting({ ...converting, busy: true });
    const res = await fetch(`/api/manager/hotels/${hotel.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inquiryId: q.id,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        adults: q.adults ?? 2,
        children: q.children ?? 0,
        roomId,
        promotionId,
        totalMinor: totalMajor != null ? Math.round(totalMajor * 100) : null,
        notes: q.message.slice(0, 2000),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "green", message: "Rezervasyon oluşturuldu." });
      setConverting(null);
      await setStatus(q.id, "ilgileniliyor");
    } else {
      setConverting((c) => c && { ...c, busy: false });
      notifications.show({ color: "red", message: json.error ?? "Dönüştürülemedi." });
    }
  }

  const exportUrl = hotel
    ? `/api/manager/inquiries/export?hotelId=${hotel.id}${durum ? `&durum=${durum}` : ""}${kaynak ? `&kaynak=${kaynak}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`
    : "#";

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <TextInput
            aria-label="Taleplerde ara"
            placeholder="Misafir adı veya mesajda ara"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={280}
          />
          <Select
            placeholder="Durum"
            clearable
            data={Object.entries(inquiryStatusLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={durum}
            onChange={(v) => {
              setDurum(v);
            }}
          />
          <Select
            placeholder="Kaynak"
            clearable
            data={Object.entries(inquirySourceLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={kaynak}
            onChange={(v) => {
              setKaynak(v);
            }}
          />
        </Group>
        {hotel && (
          <Button
            component="a"
            href={exportUrl}
            variant="light"
            leftSection={<IconDownload size={16} />}
          >
            CSV indir
          </Button>
        )}
      </Group>

      <Paper withBorder radius="md">
        <ScrollArea type="auto">
        <Table highlightOnHover miw={920}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Misafir</Table.Th>
              <Table.Th>Konaklama</Table.Th>
              <Table.Th>Kaynak</Table.Th>
              <Table.Th>Pazarlama</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {inquiries.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <PanelEmpty title="Talep bulunamadı" description="Bu filtreyle eşleşen talep yok." />
                </Table.Td>
              </Table.Tr>
            )}
            {inquiries.map((q) => (
              <Table.Tr key={q.id}>
                <Table.Td>
                  <Text fw={500}>{q.name}</Text>
                </Table.Td>
                <Table.Td>
                  {q.checkIn || q.checkOut ? (
                    <Text size="sm">
                      {q.checkIn ?? "—"} → {q.checkOut ?? "—"}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                  {(q.adults != null || q.roomSlug) && (
                    <Text size="xs" c="dimmed">
                      {q.adults != null ? `${q.adults} yetişkin` : ""}
                      {q.children ? `, ${q.children} çocuk` : ""}
                      {q.roomSlug ? ` · ${q.roomSlug}` : ""}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{inquirySourceLabels[q.source]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={q.marketingConsent ? "green" : "gray"} variant="light">
                    {q.marketingConsent ? "Evet" : "Hayır"}
                  </Badge>
                </Table.Td>
                <Table.Td maw={240}>
                  <Text size="sm" lineClamp={2}>
                    {q.message}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={inquiryStatusColors[q.status]}>
                    {inquiryStatusLabels[q.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconMessage size={14} />}
                      onClick={() => openThread(q.id)}
                    >
                      Mesajlar
                    </Button>
                    {q.checkIn && q.checkOut && q.status !== "kapatildi" && (
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        leftSection={<IconCalendarPlus size={14} />}
                        onClick={() => void openConvert(q)}
                      >
                        Rezervasyona dönüştür
                      </Button>
                    )}
                    {q.status === "yeni" && (
                      <Button size="xs" variant="light" onClick={() => setStatus(q.id, "ilgileniliyor")}>
                        İlgileniliyor
                      </Button>
                    )}
                    {q.status !== "kapatildi" && (
                      <Button size="xs" variant="default" onClick={() => setStatus(q.id, "kapatildi")}>
                        Kapat
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </ScrollArea>
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={limit}
          onSayfaChange={setSayfa}
        />
      </Paper>

      <Drawer
        opened={!!threadId}
        onClose={() => setThreadId(null)}
        title="Mesaj thread'i"
        position="right"
        size="md"
      >
        <Stack gap="sm">
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconLinkOff size={14} />}
              onClick={revokePortalLink}
            >
              Portal linkini iptal et
            </Button>
          </Group>
          {messages.map((m) => (
            <Paper key={m.id} p="sm" radius="md" bg={m.senderRole === "hotel" ? "indigo.0" : "gray.0"}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" c="dimmed">
                  {m.senderRole === "guest" ? "Misafir" : m.senderName ?? "Tesis"} —{" "}
                  {new Date(m.createdAt).toLocaleString("tr-TR")}
                </Text>
                {m.approvalStatus === "bekliyor" && (
                  <Badge size="xs" color="yellow" variant="light">
                    Onay bekliyor
                  </Badge>
                )}
                {m.approvalStatus === "reddedildi" && (
                  <Badge size="xs" color="red" variant="light">
                    Reddedildi
                  </Badge>
                )}
              </Group>
              <Text size="sm">{m.body}</Text>
            </Paper>
          ))}
          <Textarea label="Yanıt" minRows={3} value={reply} onChange={(e) => setReply(e.currentTarget.value)} />
          <Button onClick={sendReply}>Gönder</Button>
        </Stack>
      </Drawer>
      {confirmModal}
      <Modal opened={converting != null} onClose={() => setConverting(null)} title="Rezervasyona dönüştür">
        {converting && (
          <Stack gap="sm">
            <Text size="sm">
              {converting.inquiry.name} · {converting.inquiry.checkIn} → {converting.inquiry.checkOut} ·{" "}
              {converting.inquiry.adults ?? 2} yetişkin{converting.inquiry.children ? `, ${converting.inquiry.children} çocuk` : ""}
            </Text>
            <Select
              label="Oda"
              placeholder="Oda seçin"
              data={roomOptions}
              value={converting.roomId}
              onChange={(v) => setConverting({ ...converting, roomId: v, promotionId: null })}
              clearable
            />
            <Select
              label="Uygulanan kampanya"
              description="Kontenjanlı kampanyada bu rezervasyon kontenjandan düşer."
              placeholder="Kampanya yok"
              data={promotionOptions
                .filter((p) => !p.roomIds.length || (converting.roomId != null && p.roomIds.includes(converting.roomId)))
                .map(({ value, label }) => ({ value, label }))}
              value={converting.promotionId}
              onChange={(v) => setConverting({ ...converting, promotionId: v })}
              clearable
            />
            <NumberInput
              label="Toplam tutar (₺, isteğe bağlı)"
              min={0}
              decimalScale={2}
              thousandSeparator="."
              decimalSeparator=","
              value={converting.totalMajor ?? ""}
              onChange={(v) => setConverting({ ...converting, totalMajor: typeof v === "number" ? v : null })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConverting(null)}>
                Vazgeç
              </Button>
              <Button loading={converting.busy} onClick={() => void convertToBooking()}>
                Rezervasyon oluştur
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
