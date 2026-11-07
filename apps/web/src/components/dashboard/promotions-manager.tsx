"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";
import { usePanelConfirm } from "./panel-confirm";
import { PanelRevisionConflictModal, usePanelRevision } from "./panel-revision-conflict";

interface StayPayTier {
  stay: number;
  pay: number;
}

type FreeNightRule = "hafta_ici" | "en_ucuz";

interface PromotionRow {
  id: string;
  name: string;
  /** Kal-öde kampanyasında boş. */
  discountPercent: number | null;
  stayPayTiers?: StayPayTier[];
  freeNightRule?: FreeNightRule | null;
  validFrom: string | null;
  validTo: string | null;
  minNights: number | null;
  maxNights?: number | null;
  bookableFrom?: string | null;
  bookableTo?: string | null;
  allotment?: number | null;
  roomIds: string[];
  isActive: boolean;
}

interface RoomOption {
  id: string;
  name: string;
}

interface PromoForm {
  name: string;
  /** "yuzde": gece fiyatına yüzde indirim; "kal_ode": "4 kal 3 öde" basamakları. */
  kind: "yuzde" | "kal_ode";
  discountPercent: number;
  tiers: StayPayTier[];
  freeNightRule: FreeNightRule;
  validFrom: string;
  validTo: string;
  minNights: number | null;
  maxNights: number | null;
  bookableFrom: string;
  bookableTo: string;
  allotment: number | null;
  roomIds: string[];
  isActive: boolean;
}

const emptyForm: PromoForm = {
  name: "",
  kind: "yuzde",
  discountPercent: 10,
  tiers: [{ stay: 4, pay: 3 }],
  freeNightRule: "hafta_ici",
  validFrom: "",
  validTo: "",
  minNights: null,
  maxNights: null,
  bookableFrom: "",
  bookableTo: "",
  allotment: null,
  roomIds: [],
  isActive: true,
};

export function PromotionsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const { confirm: confirmDelete, modal: confirmModal } = usePanelConfirm();
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const lock = usePanelRevision();
  const setLockRevision = lock.setRevision;

  const reload = useCallback(async () => {
    if (!hotel) return;
    const [promoRes, roomsRes] = await Promise.all([
      fetch(`/api/manager/hotels/${hotel.id}/promotions`),
      fetch(`/api/manager/hotels/${hotel.id}/rooms`),
    ]);
    const promoJson = await promoRes.json();
    const roomsJson = await roomsRes.json();
    if (promoJson.ok) { setPromotions(promoJson.promotions); setLockRevision(promoJson.revision); }
    if (roomsJson.ok) {
      setRooms(
        (roomsJson.rooms as { id: string; name: string }[]).map((r) => ({
          id: r.id,
          name: r.name,
        })),
      );
    }
  }, [hotel, setLockRevision]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!hotel || !promotions) return <Loader />;

  const roomOptions = rooms.map((r) => ({ value: r.id, label: r.name }));
  const roomLabel = (ids: string[]) =>
    ids.length === 0
      ? "Tüm odalar"
      : ids.map((id) => rooms.find((r) => r.id === id)?.name ?? id.slice(0, 6)).join(", ");

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: PromotionRow) {
    setEditingId(p.id);
    const tiers = p.stayPayTiers ?? [];
    setForm({
      name: p.name,
      kind: tiers.length ? "kal_ode" : "yuzde",
      discountPercent: p.discountPercent ?? 10,
      tiers: tiers.length ? tiers : [{ stay: 4, pay: 3 }],
      freeNightRule: p.freeNightRule ?? "hafta_ici",
      validFrom: p.validFrom ?? "",
      validTo: p.validTo ?? "",
      minNights: p.minNights,
      maxNights: p.maxNights ?? null,
      bookableFrom: p.bookableFrom ?? "",
      bookableTo: p.bookableTo ?? "",
      allotment: p.allotment ?? null,
      roomIds: p.roomIds,
      isActive: p.isActive,
    });
    setOpen(true);
  }

  async function save() {
    if (form.kind === "kal_ode") {
      const bad = form.tiers.find((t) => !(t.stay >= 2 && t.pay >= 1 && t.pay < t.stay));
      if (bad || form.tiers.length === 0) {
        notifications.show({ color: "red", message: "Her basamakta ödenen gece, kalınan geceden az olmalı (ör. 4 kal 3 öde)." });
        return;
      }
    }
    // Tür değişince diğer türün alanı temizlenir (yüzde ya da basamak — ikisi birden değil).
    const payload = {
      name: form.name,
      discountPercent: form.kind === "yuzde" ? form.discountPercent : null,
      stayPayTiers: form.kind === "kal_ode" ? [...form.tiers].sort((a, b) => a.stay - b.stay) : [],
      freeNightRule: form.kind === "kal_ode" ? form.freeNightRule : null,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      minNights: form.minNights,
      maxNights: form.maxNights,
      bookableFrom: form.bookableFrom || null,
      bookableTo: form.bookableTo || null,
      allotment: form.allotment,
      roomIds: form.roomIds,
      isActive: form.isActive,
    };
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId
        ? { id: editingId, ...payload, expectedRevision: lock.revision }
        : { ...payload, expectedRevision: lock.revision }),
    });
    const json = await res.json();
    if (lock.consumeResponse(json)) return;
    if (json.ok) {
      notifications.show({
        color: "green",
        message: editingId ? "Kampanya güncellendi." : "Kampanya oluşturuldu.",
      });
      setOpen(false);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydedilemedi." });
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive, expectedRevision: lock.revision }),
    });
    const json = await res.json();
    if (lock.consumeResponse(json)) return;
    void reload();
  }

  async function removePromotion(id: string) {
    if (!(await confirmDelete({ title: "Kampanyayı sil", message: "Bu kampanyayı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.", confirmLabel: "Sil" }))) return;
    const res = await fetch(`/api/manager/hotels/${hotel!.id}/promotions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, expectedRevision: lock.revision }),
    });
    const json = await res.json();
    if (lock.consumeResponse(json)) return;
    void reload();
  }

  return (
    <Stack gap="md">
      {confirmModal}
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Kampanya ekle
        </Button>
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad</Table.Th>
              <Table.Th>İndirim</Table.Th>
              <Table.Th>Odalar</Table.Th>
              <Table.Th>Geçerlilik</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {promotions.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>
                  {p.stayPayTiers?.length
                    ? p.stayPayTiers.map((t) => `${t.stay} kal ${t.pay} öde`).join(", ")
                    : `%${p.discountPercent ?? 0}`}
                </Table.Td>
                <Table.Td>
                  <Text size="xs" lineClamp={2} maw={160}>
                    {roomLabel(p.roomIds)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.validFrom ?? "—"} — {p.validTo ?? "—"}
                  {(p.minNights != null || p.maxNights != null) && (
                    <Text size="xs" c="dimmed">
                      {p.minNights != null && p.maxNights != null
                        ? `${p.minNights}-${p.maxNights} gece`
                        : p.minNights != null
                          ? `min. ${p.minNights} gece`
                          : `en fazla ${p.maxNights} gece`}
                    </Text>
                  )}
                  {(p.bookableFrom || p.bookableTo) && (
                    <Text size="xs" c="dimmed">
                      Rezervasyon: {p.bookableFrom ?? "…"} — {p.bookableTo ?? "…"}
                    </Text>
                  )}
                  {p.allotment != null && (
                    <Text size="xs" c="dimmed">
                      Kontenjan {p.allotment} oda / gece
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={p.isActive ? "green" : "gray"}>
                    {p.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openEdit(p)} aria-label="Düzenle" title="Düzenle">
                      <IconPencil size={14} />
                    </Button>
                    <Button size="xs" variant="light" onClick={() => toggleActive(p.id, p.isActive)}>
                      {p.isActive ? "Durdur" : "Aktifleştir"}
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removePromotion(p.id)}
                    >
                      Sil
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Kampanyayı düzenle" : "Yeni kampanya"}
      >
        <Stack gap="sm">
          <TextInput
            label="Ad"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <SegmentedControl
            aria-label="Kampanya türü"
            data={[
              { value: "yuzde", label: "Yüzde indirim" },
              { value: "kal_ode", label: "Kal-öde" },
            ]}
            value={form.kind}
            onChange={(v) => setForm({ ...form, kind: v as PromoForm["kind"] })}
          />
          {form.kind === "yuzde" ? (
            <NumberInput
              label="İndirim (%)"
              min={1}
              max={90}
              value={form.discountPercent}
              onChange={(v) => setForm({ ...form, discountPercent: Number(v) || 10 })}
            />
          ) : (
            <Stack gap={6}>
              <Text size="xs" c="dimmed">
                Konaklamanın tamamına uygulanır; en uzun uyan basamak geçerlidir (ör. 9 gecede &ldquo;8
                kal 6 öde&rdquo;). Konaklamanın bütün geceleri kampanya tarihleri içinde olmalı. Yüzde
                kampanyalarla birleşmez; misafir hangisi ucuzsa onu öder.
              </Text>
              {form.tiers.map((t, i) => (
                <Group key={i} gap="xs" align="flex-end">
                  <NumberInput
                    label={i === 0 ? "Kal (gece)" : undefined}
                    aria-label="Kalınan gece"
                    min={2}
                    max={30}
                    w={110}
                    value={t.stay}
                    onChange={(v) =>
                      setForm({ ...form, tiers: form.tiers.map((x, j) => (j === i ? { ...x, stay: Number(v) || 0 } : x)) })
                    }
                  />
                  <NumberInput
                    label={i === 0 ? "Öde (gece)" : undefined}
                    aria-label="Ödenen gece"
                    min={1}
                    max={29}
                    w={110}
                    value={t.pay}
                    onChange={(v) =>
                      setForm({ ...form, tiers: form.tiers.map((x, j) => (j === i ? { ...x, pay: Number(v) || 0 } : x)) })
                    }
                  />
                  <Button
                    variant="light"
                    color="red"
                    aria-label="Basamağı kaldır"
                    title="Basamağı kaldır"
                    disabled={form.tiers.length === 1}
                    onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}
                  >
                    <IconTrash size={14} />
                  </Button>
                </Group>
              ))}
              <Button
                variant="light"
                size="xs"
                leftSection={<IconPlus size={14} />}
                w="fit-content"
                onClick={() => {
                  const last = form.tiers[form.tiers.length - 1] ?? { stay: 3, pay: 2 };
                  setForm({ ...form, tiers: [...form.tiers, { stay: last.stay + 1, pay: last.pay + 1 }] });
                }}
              >
                Basamak ekle
              </Button>
              <Select
                label="Ücretsiz gece"
                data={[
                  { value: "hafta_ici", label: "Hafta içi gecelerden düşülür (Pazar–Perşembe)" },
                  { value: "en_ucuz", label: "En ucuz geceden düşülür" },
                ]}
                value={form.freeNightRule}
                allowDeselect={false}
                onChange={(v) => setForm({ ...form, freeNightRule: (v as FreeNightRule) ?? "hafta_ici" })}
              />
            </Stack>
          )}
          <MultiSelect
            label="Odalar"
            description="Boş bırakılırsa tüm odalara uygulanır"
            data={roomOptions}
            value={form.roomIds}
            onChange={(v) => setForm({ ...form, roomIds: v })}
            clearable
          />
          <Group grow>
            <TextInput
              label="Başlangıç"
              description="Konaklama tarihi"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm({ ...form, validFrom: e.currentTarget.value })}
            />
            <TextInput
              label="Bitiş"
              description="Konaklama tarihi"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm({ ...form, validTo: e.currentTarget.value })}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Min. gece"
              min={1}
              value={form.minNights ?? ""}
              onChange={(v) => setForm({ ...form, minNights: v === "" ? null : Number(v) })}
            />
            <NumberInput
              label="En fazla gece"
              description="ör. 2-3 gecelik fırsat"
              min={1}
              value={form.maxNights ?? ""}
              onChange={(v) => setForm({ ...form, maxNights: v === "" ? null : Number(v) })}
            />
          </Group>
          <Group grow>
            <TextInput
              label="İlk rezervasyon tarihi"
              description="Erken rezervasyon için"
              type="date"
              value={form.bookableFrom}
              onChange={(e) => setForm({ ...form, bookableFrom: e.currentTarget.value })}
            />
            <TextInput
              label="Son rezervasyon tarihi"
              description="Bu tarihten sonra yapılan talepte geçmez"
              type="date"
              value={form.bookableTo}
              onChange={(e) => setForm({ ...form, bookableTo: e.currentTarget.value })}
            />
          </Group>
          <NumberInput
            label="Kontenjan (oda / gece)"
            description="Boşsa sınırsız. Bu kampanyayla açılan rezervasyonlar o gece bu sayıya ulaşınca kampanya o gece için kapanır."
            min={1}
            value={form.allotment ?? ""}
            onChange={(v) => setForm({ ...form, allotment: v === "" ? null : Number(v) })}
          />
          <Switch
            label="Aktif"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.currentTarget.checked })}
          />
          <Button onClick={save}>{editingId ? "Güncelle" : "Oluştur"}</Button>
        </Stack>
      </Modal>
      <PanelRevisionConflictModal
        conflict={lock.conflict}
        onKeepLocal={lock.keepLocalDraft}
        onLoadLatest={async () => { setOpen(false); await reload(); lock.clearConflict(); }}
      />
    </Stack>
  );
}
