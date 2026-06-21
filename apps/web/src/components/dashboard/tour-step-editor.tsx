"use client";

// ---------------------------------------------------------------------------
// Tur adım editörü — adımları listele, sırala (yukarı/aşağı), düzenle,
// ekle/sil ve topluca kaydet (PUT .../steps).
// Dallar (branches) ve AI metadata dahil tüm manifest alanları düzenlenebilir.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconDeviceFloppy,
  IconExternalLink,
  IconGripVertical,
  IconPlus,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import type { TourCallout, TourHotspot, TourStep, TourStepBranch } from "@/lib/schemas/tour-manifest";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";
import { MediaPicker } from "./media-picker";

const kindOptions = [
  { value: "lobby", label: "Lobi" },
  { value: "corridor", label: "Koridor" },
  { value: "room", label: "Oda" },
  { value: "amenity_spot", label: "Olanak (sahil, spa, restoran…)" },
];

interface TourMeta {
  id: string;
  tourId: string;
  title: string;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  version: number;
}

function emptyStep(index: number): TourStep {
  return {
    stepId: `adim-${index + 1}`,
    order: index,
    kind: "lobby",
    title: "Yeni adım",
    requiresUserContinue: false,
    media: { mode: "clip", src: "" },
  };
}

export function TourStepEditor({ tourId }: { tourId: string }) {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [meta, setMeta] = useState<TourMeta | null>(null);
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const reloadTour = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours/${tourId}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const json = await res.json();
    if (json.ok) {
      setMeta(json.tour);
      const loaded: TourStep[] = (json.steps as Array<Record<string, unknown>>).map(
        (s, i) =>
          ({
            stepId: s.stepId,
            order: i,
            kind: s.kind,
            title: s.title,
            body: s.body ?? undefined,
            requiresUserContinue: Boolean(s.requiresUserContinue),
            media: {
              mode: (s.media as { mode: "clip" | "window" }).mode,
              src: s.mediaUrl as string,
              startSec: (s.media as { startSec?: number }).startSec,
              endSec: (s.media as { endSec?: number }).endSec,
            },
            captionsVttUrl: s.captionsVttUrl ?? undefined,
            narrationUrl: s.narrationUrl ?? undefined,
            branches:
              Array.isArray(s.branches) && s.branches.length > 0
                ? (s.branches as TourStepBranch[])
                : undefined,
            callouts:
              Array.isArray(s.callouts) && s.callouts.length > 0
                ? (s.callouts as TourCallout[])
                : undefined,
            hotspots:
              Array.isArray(s.hotspots) && s.hotspots.length > 0
                ? (s.hotspots as TourHotspot[])
                : undefined,
            aiTags: Array.isArray(s.aiTags) && s.aiTags.length > 0 ? (s.aiTags as string[]) : undefined,
            aiDescription: (s.aiDescription as string) ?? undefined,
            aiPromo: Array.isArray(s.aiPromo) && s.aiPromo.length > 0 ? (s.aiPromo as string[]) : undefined,
            aiVisible: s.aiVisible === undefined ? true : Boolean(s.aiVisible),
          }) as TourStep,
      );
      setSteps(loaded);
    }
  }, [hotel, tourId]);

  useEffect(() => {
    if (!hotel) return;
    void reloadTour();
  }, [hotel, reloadTour]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (notFound) {
    return (
      <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
        Tur bulunamadı. Önce &quot;Turlar&quot; sayfasından bir tur oluşturun.
      </Alert>
    );
  }
  if (!hotel || !meta || !steps) return <Loader />;

  function updateStep(index: number, patch: Partial<TourStep>) {
    setSteps((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function move(index: number, delta: -1 | 1) {
    setSteps((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeStep(index: number) {
    setSteps((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function addStep() {
    setSteps((prev) => (prev ? [...prev, emptyStep(prev.length)] : prev));
  }

  function reorderSteps(from: number, to: number) {
    if (from === to) return;
    setSteps((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function saveAll() {
    if (!hotel || !steps) return;
    if (steps.length === 0) {
      notifications.show({ color: "red", message: "En az bir adım gerekli." });
      return;
    }
    setSaving(true);
    const payload = steps.map((s, i) => ({ ...s, order: i }));
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours/${tourId}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: payload }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      notifications.show({ color: "green", message: `${json.count} adım kaydedildi.` });
      void reloadTour();
    } else if (res.status === 409) {
      notifications.show({
        color: "orange",
        message: `${json.error ?? "Çakışma"} — sunucudan güncel veri alınıyor.`,
      });
      void reloadTour();
    } else {
      notifications.show({
        color: "red",
        message: json.error ?? "Kaydetme başarısız oldu.",
      });
    }
  }

  async function submitForReview() {
    if (!hotel) return;
    setSubmitting(true);
    const res = await fetch(`/api/manager/hotels/${hotel.id}/tours/${tourId}/submit`, {
      method: "POST",
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.ok) {
      notifications.show({ color: "blue", message: "Tur incelemeye gönderildi." });
      setMeta((m) => (m ? { ...m, status: json.status } : m));
    } else if (res.status === 409) {
      notifications.show({
        color: "orange",
        message: `${json.error ?? "Tur durumu değişti"} — sayfa yenileniyor.`,
      });
      void reloadTour();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderme başarısız oldu." });
    }
  }

  const stepIdOptions = steps.map((s) => ({ value: s.stepId, label: `${s.title} (${s.stepId})` }));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Badge color={moderationStatusColors[meta.status]}>
            {moderationStatusLabels[meta.status]}
          </Badge>
          <Text size="sm" c="dimmed">
            v{meta.version} — {steps.length} adım
          </Text>
        </Group>
        <Group gap="xs">
          {steps.length > 0 && hotel && (
            <Button
              component={Link}
              href={`/dashboard/tours/${tourId}/preview`}
              target="_blank"
              variant="default"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
            >
              Taslak önizle
            </Button>
          )}
          {meta.status === "yayinda" && hotel && (
            <Button
              component={Link}
              href={`/tours/${hotel.slug}/${tourId}`}
              target="_blank"
              variant="default"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
            >
              Yayın turu
            </Button>
          )}
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addStep}>
            Adım ekle
          </Button>
          {(meta.status === "taslak" || meta.status === "reddedildi") && (
            <Button
              variant="light"
              leftSection={<IconSend size={16} />}
              loading={submitting}
              onClick={submitForReview}
            >
              İncelemeye gönder
            </Button>
          )}
          <Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={saveAll}>
            Tümünü kaydet
          </Button>
        </Group>
      </Group>

      {meta.status === "reddedildi" && meta.moderationNote && (
        <Alert color="red" title="Reddedilme nedeni" icon={<IconAlertCircle size={16} />}>
          {meta.moderationNote}
        </Alert>
      )}

      <Accordion variant="separated" multiple>
        {steps.map((s, i) => (
          <Accordion.Item
            key={`${s.stepId}-${i}`}
            value={`${s.stepId}-${i}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) {
                reorderSteps(dragIndex, i);
                setDragIndex(i);
              }
            }}
            style={{
              opacity: dragIndex === i ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <Accordion.Control>
              <Group gap="sm" wrap="nowrap">
                <IconGripVertical
                  size={16}
                  stroke={1.5}
                  style={{ cursor: "grab", flexShrink: 0, opacity: 0.45 }}
                  aria-hidden
                />
                <Text fw={600} truncate>
                  {i + 1}. {s.title}
                </Text>
                <Text size="xs" c="dimmed">
                  {s.stepId}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group justify="flex-end" gap="xs">
                  <Tooltip label="Yukarı taşı">
                    <ActionIcon variant="default" disabled={i === 0} onClick={() => move(i, -1)}>
                      <IconArrowUp size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Aşağı taşı">
                    <ActionIcon
                      variant="default"
                      disabled={i === steps.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Adımı sil">
                    <ActionIcon color="red" variant="light" onClick={() => removeStep(i)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Group grow>
                  <TextInput
                    label="Adım kimliği"
                    description="Benzersiz olmalı (örn. s1, lobi)"
                    value={s.stepId}
                    onChange={(e) => updateStep(i, { stepId: e.currentTarget.value })}
                  />
                  <TextInput
                    label="Başlık"
                    value={s.title}
                    onChange={(e) => updateStep(i, { title: e.currentTarget.value })}
                  />
                  <Select
                    label="Tür"
                    data={kindOptions}
                    value={s.kind}
                    onChange={(v) => v && updateStep(i, { kind: v as TourStep["kind"] })}
                  />
                </Group>

                <Textarea
                  label="Açıklama metni"
                  autosize
                  minRows={2}
                  value={s.body ?? ""}
                  onChange={(e) => updateStep(i, { body: e.currentTarget.value || undefined })}
                />

                <Divider label="Medya" labelPosition="left" />
                {hotel && (
                  <MediaPicker
                    hotelId={hotel.id}
                    mediaType="video"
                    label="Video adresi"
                    value={s.media.src}
                    onChange={(url) =>
                      updateStep(i, { media: { ...s.media, src: url } })
                    }
                  />
                )}
                <Group grow>
                  <Select
                    label="Oynatma modu"
                    data={[
                      { value: "clip", label: "Klip (tamamı)" },
                      { value: "window", label: "Pencere (aralık)" },
                    ]}
                    value={s.media.mode}
                    onChange={(v) =>
                      v && updateStep(i, { media: { ...s.media, mode: v as "clip" | "window" } })
                    }
                  />
                  <TextInput
                    label="Anlatım sesi (URL)"
                    value={s.narrationUrl ?? ""}
                    onChange={(e) =>
                      updateStep(i, { narrationUrl: e.currentTarget.value || undefined })
                    }
                  />
                </Group>
                <Group grow>
                  <NumberInput
                    label="Başlangıç (sn)"
                    min={0}
                    value={s.media.startSec ?? ""}
                    onChange={(v) =>
                      updateStep(i, {
                        media: { ...s.media, startSec: typeof v === "number" ? v : undefined },
                      })
                    }
                  />
                  <NumberInput
                    label="Bitiş (sn)"
                    min={0}
                    value={s.media.endSec ?? ""}
                    onChange={(v) =>
                      updateStep(i, {
                        media: { ...s.media, endSec: typeof v === "number" ? v : undefined },
                      })
                    }
                  />
                  <TextInput
                    label="Altyazı (VTT URL)"
                    value={s.captionsVttUrl ?? ""}
                    onChange={(e) =>
                      updateStep(i, { captionsVttUrl: e.currentTarget.value || undefined })
                    }
                  />
                </Group>
                <Switch
                  label="Devam için kullanıcı onayı gereksin"
                  checked={s.requiresUserContinue}
                  onChange={(e) =>
                    updateStep(i, { requiresUserContinue: e.currentTarget.checked })
                  }
                />

                <Divider label="Bilgi kutuları (callout)" labelPosition="left" />
                {(s.callouts ?? []).map((c, ci) => (
                  <Group key={c.id} grow align="flex-end">
                    <TextInput
                      label="Başlık"
                      value={c.title}
                      onChange={(e) => {
                        const callouts = [...(s.callouts ?? [])];
                        callouts[ci] = { ...c, title: e.currentTarget.value };
                        updateStep(i, { callouts });
                      }}
                    />
                    <NumberInput
                      label="Saniye"
                      min={0}
                      value={c.tSec}
                      onChange={(v) => {
                        const callouts = [...(s.callouts ?? [])];
                        callouts[ci] = { ...c, tSec: typeof v === "number" ? v : 0 };
                        updateStep(i, { callouts });
                      }}
                    />
                    <TextInput
                      label="Metin"
                      value={c.body ?? ""}
                      onChange={(e) => {
                        const callouts = [...(s.callouts ?? [])];
                        callouts[ci] = { ...c, body: e.currentTarget.value || undefined };
                        updateStep(i, { callouts });
                      }}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      mb={6}
                      onClick={() => {
                        const callouts = (s.callouts ?? []).filter((_, x) => x !== ci);
                        updateStep(i, { callouts: callouts.length ? callouts : undefined });
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
                <Button
                  size="xs"
                  variant="default"
                  w="fit-content"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    const callouts = [
                      ...(s.callouts ?? []),
                      {
                        id: `c${(s.callouts?.length ?? 0) + 1}-${Date.now()}`,
                        tSec: 0,
                        title: "Yeni bilgi",
                      },
                    ];
                    updateStep(i, { callouts });
                  }}
                >
                  Callout ekle
                </Button>

                <Divider label="Hotspot (tıklanabilir nokta)" labelPosition="left" />
                {(s.hotspots ?? []).map((h, hi) => (
                  <Group key={h.id} grow align="flex-end">
                    <TextInput
                      label="Etiket"
                      value={h.label}
                      onChange={(e) => {
                        const hotspots = [...(s.hotspots ?? [])];
                        hotspots[hi] = { ...h, label: e.currentTarget.value };
                        updateStep(i, { hotspots });
                      }}
                    />
                    <NumberInput
                      label="X %"
                      min={0}
                      max={100}
                      value={h.xPct}
                      onChange={(v) => {
                        const hotspots = [...(s.hotspots ?? [])];
                        hotspots[hi] = { ...h, xPct: typeof v === "number" ? v : 0 };
                        updateStep(i, { hotspots });
                      }}
                    />
                    <NumberInput
                      label="Y %"
                      min={0}
                      max={100}
                      value={h.yPct}
                      onChange={(v) => {
                        const hotspots = [...(s.hotspots ?? [])];
                        hotspots[hi] = { ...h, yPct: typeof v === "number" ? v : 0 };
                        updateStep(i, { hotspots });
                      }}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      mb={6}
                      onClick={() => {
                        const hotspots = (s.hotspots ?? []).filter((_, x) => x !== hi);
                        updateStep(i, { hotspots: hotspots.length ? hotspots : undefined });
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
                <Button
                  size="xs"
                  variant="default"
                  w="fit-content"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    const hotspots = [
                      ...(s.hotspots ?? []),
                      {
                        id: `h${(s.hotspots?.length ?? 0) + 1}-${Date.now()}`,
                        xPct: 50,
                        yPct: 50,
                        label: "Yeni nokta",
                      },
                    ];
                    updateStep(i, { hotspots });
                  }}
                >
                  Hotspot ekle
                </Button>

                <Divider label="Dallanma (yol seçimi)" labelPosition="left" />
                {(s.branches ?? []).map((b, bi) => (
                  <Group key={b.id} grow align="flex-end">
                    <TextInput
                      label="Buton etiketi"
                      value={b.label}
                      onChange={(e) => {
                        const branches = [...(s.branches ?? [])];
                        branches[bi] = { ...b, label: e.currentTarget.value };
                        updateStep(i, { branches });
                      }}
                    />
                    <Select
                      label="Hedef adım"
                      data={stepIdOptions}
                      value={b.nextStepId}
                      onChange={(v) => {
                        if (!v) return;
                        const branches = [...(s.branches ?? [])];
                        branches[bi] = { ...b, nextStepId: v };
                        updateStep(i, { branches });
                      }}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      mb={6}
                      onClick={() => {
                        const branches = (s.branches ?? []).filter((_, x) => x !== bi);
                        updateStep(i, { branches: branches.length ? branches : undefined });
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
                <Button
                  size="xs"
                  variant="default"
                  w="fit-content"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    const branches = [
                      ...(s.branches ?? []),
                      {
                        id: `b${(s.branches?.length ?? 0) + 1}-${Date.now()}`,
                        label: "Yeni yol",
                        nextStepId: s.stepId,
                      },
                    ];
                    updateStep(i, { branches });
                  }}
                >
                  Dal ekle
                </Button>

                <Divider label="Yapay Zeka Rehberi" labelPosition="left" />
                <TagsInput
                  label="Etiketler"
                  description="Eş anlamlılar ve farklı diller — örn. sahil, plaj, beach"
                  value={s.aiTags ?? []}
                  onChange={(v) => updateStep(i, { aiTags: v.length ? v : undefined })}
                />
                <Textarea
                  label="AI açıklaması"
                  description="Rehberin bu alanı anlatırken kullanacağı bağlam (en az 20 karakter önerilir)"
                  autosize
                  minRows={2}
                  value={s.aiDescription ?? ""}
                  error={
                    s.aiVisible !== false &&
                    (s.aiDescription?.trim().length ?? 0) < 20
                      ? "Boş veya kısa açıklama tur tamamlama oranını düşürür."
                      : undefined
                  }
                  onChange={(e) =>
                    updateStep(i, { aiDescription: e.currentTarget.value || undefined })
                  }
                />
                <TagsInput
                  label="Öne çıkanlar"
                  description="Satış noktaları — örn. '24 saat concierge hizmeti'"
                  value={s.aiPromo ?? []}
                  onChange={(v) => updateStep(i, { aiPromo: v.length ? v : undefined })}
                />
                <Switch
                  label="AI bu adımı önerebilsin"
                  checked={s.aiVisible !== false}
                  onChange={(e) => updateStep(i, { aiVisible: e.currentTarget.checked })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      {steps.length === 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text c="dimmed" size="sm">
            Henüz adım yok. &quot;Adım ekle&quot; ile başlayın.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
