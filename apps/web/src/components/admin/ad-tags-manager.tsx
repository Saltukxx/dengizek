"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconTrash } from "@tabler/icons-react";

interface AdTagRow {
  id: string;
  pagePath: string | null;
  hotelId: string | null;
  hotelName: string | null;
  hotelSlug: string | null;
  googleAdsId: string | null;
  conversionLabel: string | null;
  ga4Id: string | null;
  note: string | null;
  enabled: boolean;
}

interface Option {
  value: string;
  label: string;
}

const EMPTY = { googleAdsId: "", conversionLabel: "", ga4Id: "", note: "" };

export function AdTagsManager() {
  const [tags, setTags] = useState<AdTagRow[] | null>(null);
  const [pages, setPages] = useState<Option[]>([]);
  const [hotels, setHotels] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);

  // Form: yeni kayıt ya da düzenlenen kayıt (editingId).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"page" | "hotel">("page");
  const [pagePath, setPagePath] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/ad-tags");
    const json = await res.json();
    if (!json.ok) {
      notifications.show({ color: "red", message: json.error ?? "Kodlar yüklenemedi." });
      return;
    }
    setTags(json.tags);
    setPages(json.pages.map((p: { path: string; label: string }) => ({ value: p.path, label: `${p.label} (${p.path})` })));
    setHotels(json.hotels.map((h: { id: string; name: string }) => ({ value: h.id, label: h.name })));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
    setPagePath(null);
    setHotelId(null);
  }

  function startEdit(tag: AdTagRow) {
    setEditingId(tag.id);
    setTargetType(tag.hotelId ? "hotel" : "page");
    setPagePath(tag.pagePath);
    setHotelId(tag.hotelId);
    setForm({
      googleAdsId: tag.googleAdsId ?? "",
      conversionLabel: tag.conversionLabel ?? "",
      ga4Id: tag.ga4Id ?? "",
      note: tag.note ?? "",
    });
  }

  async function send(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!json.ok) {
      notifications.show({ color: "red", message: json.error ?? "İşlem başarısız." });
      return false;
    }
    if (success) notifications.show({ color: "green", message: success });
    void reload();
    return true;
  }

  async function submit() {
    const ids = { ...form, googleAdsId: form.googleAdsId.trim(), ga4Id: form.ga4Id.trim().toUpperCase() };
    const ok = editingId
      ? await send(`/api/admin/ad-tags/${editingId}`, "PATCH", ids, "Kod güncellendi.")
      : await send(
          "/api/admin/ad-tags",
          "POST",
          { ...ids, ...(targetType === "page" ? { pagePath } : { hotelId }) },
          "Kod eklendi. Misafir sayfalarına en geç 1 dakikada yansır.",
        );
    if (ok) resetForm();
  }

  if (!tags) return <Loader />;

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    // Değer olay anında okunur: güncelleyici sonradan çalışır, currentTarget o zaman null olur.
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.currentTarget.value;
      setForm((f) => ({ ...f, [key]: value }));
    },
  });

  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>{editingId ? "Kodu düzenle" : "Yeni kod"}</Title>
          {!editingId && (
            <SegmentedControl
              value={targetType}
              onChange={(v) => setTargetType(v as "page" | "hotel")}
              data={[
                { value: "page", label: "Genel sayfa" },
                { value: "hotel", label: "Otel" },
              ]}
              w="fit-content"
            />
          )}
          {targetType === "page" ? (
            <Select label="Sayfa" placeholder="Sayfa seçin" data={pages} value={pagePath} onChange={setPagePath} disabled={Boolean(editingId)} />
          ) : (
            <Select
              label="Otel"
              description="Kod otelin sayfa, oda, tur ve talep ekranlarında yüklenir."
              placeholder="Otel ara"
              searchable
              data={hotels}
              value={hotelId}
              onChange={setHotelId}
              disabled={Boolean(editingId)}
            />
          )}
          <Group grow align="flex-start">
            <TextInput label="Google Ads kimliği" placeholder="AW-123456789" {...field("googleAdsId")} />
            <TextInput label="Dönüşüm etiketi" placeholder="AbC-D_efG123" description="Talep gönderiminde tetiklenir" {...field("conversionLabel")} />
            <TextInput label="GA4 kimliği (isteğe bağlı)" placeholder="G-XXXXXXX" {...field("ga4Id")} />
          </Group>
          <TextInput label="Not" placeholder="Ör. Yaz 2027 kampanyası" {...field("note")} />
          <Group>
            <Button onClick={submit} loading={busy}>
              {editingId ? "Kaydet" : "Ekle"}
            </Button>
            {editingId && (
              <Button variant="subtle" onClick={resetForm}>
                Vazgeç
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      {tags.length === 0 ? (
        <Text c="dimmed">Henüz kod yok.</Text>
      ) : (
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Hedef</Table.Th>
              <Table.Th>Google Ads</Table.Th>
              <Table.Th>Dönüşüm etiketi</Table.Th>
              <Table.Th>GA4</Table.Th>
              <Table.Th>Not</Table.Th>
              <Table.Th>Etkin</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tags.map((tag) => (
              <Table.Tr key={tag.id}>
                <Table.Td>
                  {tag.hotelId ? (
                    <Group gap={6}>
                      <Badge variant="light">Otel</Badge>
                      {tag.hotelName}
                    </Group>
                  ) : (
                    <Group gap={6}>
                      <Badge variant="light" color="gray">
                        Sayfa
                      </Badge>
                      {pages.find((p) => p.value === tag.pagePath)?.label ?? tag.pagePath}
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>{tag.googleAdsId ?? "—"}</Table.Td>
                <Table.Td>{tag.conversionLabel ?? "—"}</Table.Td>
                <Table.Td>{tag.ga4Id ?? "—"}</Table.Td>
                <Table.Td>{tag.note ?? ""}</Table.Td>
                <Table.Td>
                  <Switch
                    checked={tag.enabled}
                    disabled={busy}
                    onChange={(e) => void send(`/api/admin/ad-tags/${tag.id}`, "PATCH", { enabled: e.currentTarget.checked })}
                    aria-label="Etkin"
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon variant="subtle" aria-label="Düzenle" onClick={() => startEdit(tag)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Sil"
                      disabled={busy}
                      onClick={() => void send(`/api/admin/ad-tags/${tag.id}`, "DELETE", undefined, "Kod silindi.")}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
