"use client";

// ---------------------------------------------------------------------------
// Oda yönetimi — kart listesi + oluştur/düzenle çekmecesi
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Image,
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
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconBed,
  IconCalendar,
  IconPencil,
  IconPlus,
  IconRulerMeasure,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import {
  applyDiscount,
  currencies,
  formatPrice,
  toMajor,
  toMinor,
  type Currency,
} from "@/lib/price";
import { boardTypeLabels, boardTypes } from "@/lib/schemas/hotel-content";
import { occupancyFromApi, occupancyToApi, validateOccupancyForms, type OccupancyPriceForm } from "@/lib/occupancy-price";
import { PriceInput, type PriceValue } from "./price-input";
import { OccupancyPricesEditor } from "./occupancy-prices-editor";
import { MediaPicker } from "./media-picker";
import { useMyHotel } from "./use-my-hotel";

interface RateRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights: number | null;
  occupancyPrices?: { guestCount: number; priceMinor: number }[];
}

interface RoomRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sizeSqm: number | null;
  capacityAdults: number;
  capacityChildren: number;
  bedConfig: string | null;
  viewType: string | null;
  imageUrl: string | null;
  amenities: string[];
  boardType: string;
  unitCount: number | null;
  minStayNights: number | null;
  pricingNotes: string | null;
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  discountPercent: number | null;
  discountLabel: string | null;
  isActive: boolean;
  orderIndex: number;
  rates: RateRow[];
  galleryUrls: string[];
}

interface RateForm {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMajor: number | null;
  currency: Currency;
  minStayNights: number | null;
  occupancyPrices: OccupancyPriceForm[];
}

interface RoomForm {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  sizeSqm: number | null;
  capacityAdults: number;
  capacityChildren: number;
  bedConfig: string;
  viewType: string;
  imageUrl: string;
  amenities: string[];
  boardType: string;
  unitCount: number | null;
  minStayNights: number | null;
  pricingNotes: string;
  price: PriceValue;
  discountPercent: number | null;
  discountLabel: string;
  isActive: boolean;
  galleryUrls: string[];
}

const emptyForm: RoomForm = {
  slug: "",
  name: "",
  tagline: "",
  description: "",
  sizeSqm: null,
  capacityAdults: 2,
  capacityChildren: 0,
  bedConfig: "",
  viewType: "",
  imageUrl: "",
  amenities: [],
  boardType: "sadece-oda",
  unitCount: null,
  minStayNights: null,
  pricingNotes: "",
  price: { priceMinor: null, currency: "TRY", priceOnRequest: true },
  discountPercent: null,
  discountLabel: "",
  isActive: true,
  galleryUrls: [],
};

function rowToForm(r: RoomRow): RoomForm {
  return {
    slug: r.slug,
    name: r.name,
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    sizeSqm: r.sizeSqm,
    capacityAdults: r.capacityAdults,
    capacityChildren: r.capacityChildren,
    bedConfig: r.bedConfig ?? "",
    viewType: r.viewType ?? "",
    imageUrl: r.imageUrl ?? "",
    amenities: r.amenities,
    boardType: r.boardType || "sadece-oda",
    unitCount: r.unitCount,
    minStayNights: r.minStayNights,
    pricingNotes: r.pricingNotes ?? "",
    price: {
      priceMinor: r.priceMinor,
      currency: (r.currency || "TRY") as Currency,
      priceOnRequest: r.priceOnRequest,
    },
    discountPercent: r.discountPercent,
    discountLabel: r.discountLabel ?? "",
    isActive: r.isActive,
    galleryUrls: r.galleryUrls ?? [],
  };
}

function rateRowToForm(r: RateRow): RateForm {
  return {
    id: r.id,
    name: r.name,
    startDate: r.startDate,
    endDate: r.endDate,
    priceMajor: toMajor(r.priceMinor),
    currency: (r.currency || "TRY") as Currency,
    minStayNights: r.minStayNights,
    occupancyPrices: occupancyFromApi(r.occupancyPrices),
  };
}

/** Çakışan tarih aralığı var mı? (uyarı için — engellenmez) */
function hasOverlap(rates: RateForm[]): boolean {
  for (let i = 0; i < rates.length; i++) {
    for (let j = i + 1; j < rates.length; j++) {
      const a = rates[i];
      const b = rates[j];
      if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) continue;
      if (a.startDate <= b.endDate && b.startDate <= a.endDate) return true;
    }
  }
  return false;
}

export function RoomsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    form: RoomForm;
    rates: RateForm[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ratesBusy, setRatesBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/rooms`);
    const json = await res.json();
    if (json.ok) setRooms(json.rooms);
  }, [hotel]);

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
  if (!hotel || !rooms) return <Loader />;

  async function save() {
    if (!hotel || !editing) return;
    setBusy(true);
    const f = editing.form;
    const payload = {
      slug: f.slug,
      name: f.name,
      tagline: f.tagline || undefined,
      description: f.description || undefined,
      sizeSqm: f.sizeSqm,
      capacityAdults: f.capacityAdults,
      capacityChildren: f.capacityChildren,
      bedConfig: f.bedConfig || undefined,
      viewType: f.viewType || undefined,
      imageUrl: f.imageUrl,
      amenities: f.amenities,
      boardType: f.boardType,
      unitCount: f.unitCount,
      minStayNights: f.minStayNights,
      pricingNotes: f.pricingNotes || undefined,
      priceMinor: f.price.priceMinor,
      currency: f.price.currency,
      priceOnRequest: f.price.priceOnRequest,
      discountPercent: f.discountPercent,
      discountLabel: f.discountLabel || undefined,
      isActive: f.isActive,
      galleryUrls: f.galleryUrls,
    };
    const url = editing.id
      ? `/api/manager/hotels/${hotel.id}/rooms/${editing.id}`
      : `/api/manager/hotels/${hotel.id}/rooms`;
    const res = await fetch(url, {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      notifications.show({
        color: "green",
        message: editing.id ? "Oda güncellendi." : "Oda oluşturuldu.",
      });
      setEditing(null);
      void reload();
    } else {
      const issueText = json.issues
        ? Object.values(json.issues.fieldErrors ?? {}).flat().join(" · ")
        : "";
      notifications.show({
        color: "red",
        message: json.error + (issueText ? ` — ${issueText}` : ""),
      });
    }
  }

  async function removeRoom(room: RoomRow) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/rooms/${room.id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "gray", message: "Oda silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (!hotel || !rooms) return;
    const target = index + delta;
    if (target < 0 || target >= rooms.length) return;
    const next = [...rooms];
    [next[index], next[target]] = [next[target], next[index]];
    setRooms(next);
    await fetch(`/api/manager/hotels/${hotel.id}/rooms/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sirali: next.map((r) => r.id) }),
    });
  }

  async function toggleActive(room: RoomRow) {
    if (!hotel) return;
    await fetch(`/api/manager/hotels/${hotel.id}/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...roomPayload(room), isActive: !room.isActive }),
    });
    void reload();
  }

  function roomPayload(r: RoomRow) {
    return {
      slug: r.slug,
      name: r.name,
      tagline: r.tagline ?? undefined,
      description: r.description ?? undefined,
      sizeSqm: r.sizeSqm,
      capacityAdults: r.capacityAdults,
      capacityChildren: r.capacityChildren,
      bedConfig: r.bedConfig ?? undefined,
      viewType: r.viewType ?? undefined,
      imageUrl: r.imageUrl ?? "",
      amenities: r.amenities,
      boardType: r.boardType,
      unitCount: r.unitCount,
      minStayNights: r.minStayNights,
      pricingNotes: r.pricingNotes ?? undefined,
      priceMinor: r.priceMinor,
      currency: r.currency,
      priceOnRequest: r.priceOnRequest,
      discountPercent: r.discountPercent,
      discountLabel: r.discountLabel ?? undefined,
      isActive: r.isActive,
    };
  }

  async function saveRates() {
    if (!hotel || !editing?.id) return;
    setRatesBusy(true);
    const donemler = editing.rates.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      priceMinor: r.priceMajor != null ? toMinor(r.priceMajor) : 0,
      currency: r.currency,
      minStayNights: r.minStayNights,
      occupancyPrices: occupancyToApi(r.occupancyPrices),
    }));
    for (const rate of editing.rates) {
      const occErr = validateOccupancyForms(rate.occupancyPrices);
      if (occErr) {
        notifications.show({ color: "red", message: `${rate.name || "Dönem"}: ${occErr}` });
        setRatesBusy(false);
        return;
      }
    }
    const res = await fetch(
      `/api/manager/hotels/${hotel.id}/rooms/${editing.id}/rates`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donemler }),
      },
    );
    const json = await res.json();
    setRatesBusy(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Dönemsel fiyatlar kaydedildi." });
      setEditing((s) => s && { ...s, rates: json.rates.map(rateRowToForm) });
      void reload();
    } else {
      const issueText = json.issues
        ? Object.values(json.issues.fieldErrors ?? {}).flat().join(" · ")
        : "";
      notifications.show({
        color: "red",
        message: (json.error ?? "Kaydetme başarısız oldu.") + (issueText ? ` — ${issueText}` : ""),
      });
    }
  }

  function setRate(index: number, patch: Partial<RateForm>) {
    setEditing((s) => {
      if (!s) return s;
      const rates = s.rates.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return { ...s, rates };
    });
  }

  const f = editing?.form;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {rooms.length} oda tipi — misafir sayfasında bu sırayla görünür
        </Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditing({ id: null, form: emptyForm, rates: [] })}
        >
          Yeni oda
        </Button>
      </Group>

      {rooms.length === 0 && (
        <Paper withBorder p="lg">
          <Text c="dimmed" size="sm">
            Henüz oda yok. &quot;Yeni oda&quot; ile başlayın.
          </Text>
        </Paper>
      )}

      <Stack gap="sm">
        {rooms.map((room, i) => (
          <Paper key={room.id} withBorder p="md">
            <Group wrap="nowrap" align="flex-start" gap="md">
              {room.imageUrl ? (
                <Image
                  src={room.imageUrl}
                  alt={room.name}
                  w={120}
                  h={84}
                  fit="cover"
                  radius="md"
                  visibleFrom="xs"
                />
              ) : (
                <Paper
                  w={120}
                  h={84}
                  bg="gray.1"
                  radius="md"
                  visibleFrom="xs"
                  style={{ display: "grid", placeItems: "center" }}
                >
                  <IconBed size={28} color="var(--mantine-color-gray-5)" />
                </Paper>
              )}
              <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" wrap="wrap">
                  <Title order={5}>{room.name}</Title>
                  {!room.isActive && <Badge color="gray">Pasif</Badge>}
                  <Text size="xs" c="dimmed">
                    /{room.slug}
                  </Text>
                </Group>
                <Group gap="md" wrap="wrap">
                  {room.sizeSqm && (
                    <Group gap={4}>
                      <IconRulerMeasure size={14} color="var(--mantine-color-gray-6)" />
                      <Text size="xs" c="dimmed">
                        {room.sizeSqm} m²
                      </Text>
                    </Group>
                  )}
                  <Group gap={4}>
                    <IconUsers size={14} color="var(--mantine-color-gray-6)" />
                    <Text size="xs" c="dimmed">
                      {room.capacityAdults} yetişkin
                      {room.capacityChildren > 0 ? ` + ${room.capacityChildren} çocuk` : ""}
                    </Text>
                  </Group>
                  {room.bedConfig && (
                    <Group gap={4}>
                      <IconBed size={14} color="var(--mantine-color-gray-6)" />
                      <Text size="xs" c="dimmed">
                        {room.bedConfig}
                      </Text>
                    </Group>
                  )}
                </Group>
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" fw={600} c="indigo.7">
                    {room.discountPercent && !room.priceOnRequest && room.priceMinor != null ? (
                      <>
                        <Text span size="xs" c="dimmed" td="line-through" fw={400}>
                          {formatPrice(room.priceMinor, room.currency, false)}
                        </Text>{" "}
                        {formatPrice(
                          applyDiscount(room.priceMinor, room.discountPercent),
                          room.currency,
                          false,
                        )}
                      </>
                    ) : (
                      formatPrice(room.priceMinor, room.currency, room.priceOnRequest)
                    )}
                    {!room.priceOnRequest && (
                      <Text span size="xs" c="dimmed" fw={400}>
                        {" "}
                        / gece
                      </Text>
                    )}
                  </Text>
                  {room.discountPercent && !room.priceOnRequest ? (
                    <Badge color="red" size="sm" variant="light">
                      %{room.discountPercent} indirim
                    </Badge>
                  ) : null}
                  <Badge color="teal" size="sm" variant="light">
                    {boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ??
                      room.boardType}
                  </Badge>
                  {(room.rates?.length ?? 0) > 0 && (
                    <Badge
                      color="indigo"
                      size="sm"
                      variant="light"
                      leftSection={<IconCalendar size={11} />}
                    >
                      {room.rates.length} dönem
                    </Badge>
                  )}
                </Group>
              </Stack>
              <Group gap={6} wrap="nowrap">
                <Tooltip label="Yukarı">
                  <ActionIcon variant="default" disabled={i === 0} onClick={() => move(i, -1)}>
                    <IconArrowUp size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Aşağı">
                  <ActionIcon
                    variant="default"
                    disabled={i === rooms.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <IconArrowDown size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={room.isActive ? "Pasife al" : "Aktifleştir"}>
                  <Switch
                    size="sm"
                    checked={room.isActive}
                    onChange={() => toggleActive(room)}
                  />
                </Tooltip>
                <Tooltip label="Düzenle">
                  <ActionIcon
                    variant="light"
                    onClick={() =>
                      setEditing({
                        id: room.id,
                        form: rowToForm(room),
                        rates: (room.rates ?? []).map(rateRowToForm),
                      })
                    }
                  >
                    <IconPencil size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Sil">
                  <ActionIcon color="red" variant="light" onClick={() => removeRoom(room)}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Drawer
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Odayı düzenle" : "Yeni oda"}
        position="right"
        size="lg"
        padding="lg"
      >
        {f && (
          <Stack gap="sm">
            <Group grow>
              <TextInput
                label="Oda adı"
                placeholder="Deniz Manzaralı Deluxe"
                value={f.name}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, form: { ...s.form, name: e.target.value } })
                }
              />
              <TextInput
                label="Oda kimliği (URL)"
                description="küçük harf, rakam, tire"
                placeholder="deniz-manzarali-deluxe"
                value={f.slug}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, form: { ...s.form, slug: e.target.value } })
                }
              />
            </Group>
            <TextInput
              label="Kısa slogan"
              placeholder="32 m² — yatak odası, balkon"
              value={f.tagline}
              onChange={(e) =>
                setEditing((s) => s && { ...s, form: { ...s.form, tagline: e.target.value } })
              }
            />
            <Textarea
              label="Açıklama"
              autosize
              minRows={3}
              value={f.description}
              onChange={(e) =>
                setEditing(
                  (s) => s && { ...s, form: { ...s.form, description: e.target.value } },
                )
              }
            />
            <Group grow>
              <NumberInput
                label="Alan (m²)"
                min={1}
                value={f.sizeSqm ?? ""}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, sizeSqm: typeof v === "number" ? v : null },
                      },
                  )
                }
              />
              <NumberInput
                label="Yetişkin kapasitesi"
                min={1}
                max={20}
                value={f.capacityAdults}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, capacityAdults: typeof v === "number" ? v : 2 },
                      },
                  )
                }
              />
              <NumberInput
                label="Çocuk kapasitesi"
                min={0}
                max={20}
                value={f.capacityChildren}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, capacityChildren: typeof v === "number" ? v : 0 },
                      },
                  )
                }
              />
            </Group>
            <Group grow>
              <TextInput
                label="Yatak düzeni"
                placeholder="1 king + 1 çekyat"
                value={f.bedConfig}
                onChange={(e) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, bedConfig: e.target.value } },
                  )
                }
              />
              <TextInput
                label="Manzara"
                placeholder="Deniz manzarası"
                value={f.viewType}
                onChange={(e) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, viewType: e.target.value } },
                  )
                }
              />
            </Group>
            <Group grow>
              <Select
                label="Pansiyon tipi"
                data={boardTypes.map((b) => ({ value: b, label: boardTypeLabels[b] }))}
                value={f.boardType}
                allowDeselect={false}
                onChange={(v) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, boardType: v ?? "sadece-oda" } },
                  )
                }
              />
              <NumberInput
                label="Bu tipten oda adedi"
                min={1}
                value={f.unitCount ?? ""}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, unitCount: typeof v === "number" ? v : null },
                      },
                  )
                }
              />
              <NumberInput
                label="Min. konaklama (gece)"
                min={1}
                max={30}
                value={f.minStayNights ?? ""}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, minStayNights: typeof v === "number" ? v : null },
                      },
                  )
                }
              />
            </Group>
            <MediaPicker
              hotelId={hotel.id}
              value={f.imageUrl}
              onChange={(url) =>
                setEditing((s) => s && { ...s, form: { ...s.form, imageUrl: url } })
              }
            />
            <TagsInput
              label="Galeri görselleri (URL)"
              description="Ek oda fotoğrafları — geçerli https adresleri"
              value={f.galleryUrls}
              onChange={(v) =>
                setEditing((s) => s && { ...s, form: { ...s.form, galleryUrls: v } })
              }
            />
            <TagsInput
              label="Oda olanakları"
              description="Enter ile ekleyin — örn. Balkon, Jakuzi, Minibar"
              value={f.amenities}
              onChange={(v) =>
                setEditing((s) => s && { ...s, form: { ...s.form, amenities: v } })
              }
            />
            <PriceInput
              label="Gecelik fiyat (baz)"
              value={f.price}
              onChange={(price) =>
                setEditing((s) => s && { ...s, form: { ...s.form, price } })
              }
            />
            <Group grow align="flex-end">
              <NumberInput
                label="İndirim (%)"
                description="Baz ve dönem fiyatlarına uygulanır"
                min={1}
                max={90}
                disabled={f.price.priceOnRequest}
                value={f.discountPercent ?? ""}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: { ...s.form, discountPercent: typeof v === "number" ? v : null },
                      },
                  )
                }
              />
              <TextInput
                label="İndirim etiketi"
                placeholder="Erken rezervasyona özel"
                disabled={f.price.priceOnRequest || !f.discountPercent}
                value={f.discountLabel}
                onChange={(e) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, discountLabel: e.target.value } },
                  )
                }
              />
            </Group>
            <Textarea
              label="Fiyat notları"
              description="Misafir sayfasında dipnot olarak görünür"
              placeholder="3. kişi +₺800/gece. 0-6 yaş ücretsiz."
              autosize
              minRows={2}
              value={f.pricingNotes}
              onChange={(e) =>
                setEditing(
                  (s) => s && { ...s, form: { ...s.form, pricingNotes: e.target.value } },
                )
              }
            />
            <Switch
              label="Oda misafir sayfasında görünsün"
              checked={f.isActive}
              onChange={(e) =>
                setEditing(
                  (s) => s && { ...s, form: { ...s.form, isActive: e.currentTarget.checked } },
                )
              }
            />
            <Button loading={busy} onClick={save} mt="xs">
              {editing?.id ? "Kaydet" : "Oluştur"}
            </Button>

            {editing?.id ? (
              <>
                <Divider
                  label="Dönemsel fiyatlar"
                  labelPosition="left"
                  mt="md"
                />
                <Text size="xs" c="dimmed">
                  Bugünün tarihi bir döneme denk gelirse misafir o fiyatı görür;
                  çakışmada başlangıcı en geç olan dönem geçerlidir.
                </Text>
                {hasOverlap(editing.rates) && (
                  <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                    Çakışan tarih aralıkları var — bilinçli değilse tarihleri kontrol edin.
                  </Alert>
                )}
                {editing.rates.map((rate, i) => (
                  <Paper key={rate.id ?? `yeni-${i}`} withBorder p="sm">
                    <Stack gap="xs">
                      <Group gap="xs" align="flex-end" wrap="nowrap">
                        <TextInput
                          label="Dönem adı"
                          placeholder="Yaz 2026"
                          style={{ flex: 1 }}
                          value={rate.name}
                          onChange={(e) => setRate(i, { name: e.target.value })}
                        />
                        <Tooltip label="Dönemi kaldır">
                          <ActionIcon
                            color="red"
                            variant="light"
                            mb={4}
                            onClick={() =>
                              setEditing(
                                (s) =>
                                  s && { ...s, rates: s.rates.filter((_, j) => j !== i) },
                              )
                            }
                          >
                            <IconTrash size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                      <Group grow>
                        <TextInput
                          label="Başlangıç"
                          placeholder="2026-06-01"
                          value={rate.startDate}
                          onChange={(e) => setRate(i, { startDate: e.target.value })}
                        />
                        <TextInput
                          label="Bitiş"
                          placeholder="2026-09-15"
                          value={rate.endDate}
                          onChange={(e) => setRate(i, { endDate: e.target.value })}
                        />
                      </Group>
                      <Group grow>
                        <NumberInput
                          label="Gecelik fiyat"
                          min={0}
                          decimalScale={2}
                          value={rate.priceMajor ?? ""}
                          onChange={(v) =>
                            setRate(i, { priceMajor: typeof v === "number" ? v : null })
                          }
                        />
                        <Select
                          label="Para birimi"
                          data={[...currencies]}
                          allowDeselect={false}
                          value={rate.currency}
                          onChange={(v) =>
                            setRate(i, { currency: (v ?? "TRY") as Currency })
                          }
                        />
                        <NumberInput
                          label="Min. gece"
                          min={1}
                          max={30}
                          value={rate.minStayNights ?? ""}
                          onChange={(v) =>
                            setRate(i, {
                              minStayNights: typeof v === "number" ? v : null,
                            })
                          }
                        />
                      </Group>
                      <OccupancyPricesEditor
                        value={rate.occupancyPrices}
                        onChange={(occupancyPrices) => setRate(i, { occupancyPrices })}
                        capacityAdults={editing.form.capacityAdults}
                      />
                    </Stack>
                  </Paper>
                ))}
                <Group justify="space-between">
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() =>
                      setEditing(
                        (s) =>
                          s && {
                            ...s,
                            rates: [
                              ...s.rates,
                              {
                                name: "",
                                startDate: "",
                                endDate: "",
                                priceMajor: null,
                                currency: "TRY" as Currency,
                                minStayNights: null,
                                occupancyPrices: [],
                              },
                            ],
                          },
                      )
                    }
                  >
                    Dönem ekle
                  </Button>
                  <Button size="xs" loading={ratesBusy} onClick={saveRates}>
                    Dönemleri kaydet
                  </Button>
                </Group>
              </>
            ) : (
              <Text size="xs" c="dimmed">
                Dönemsel fiyatları odayı oluşturduktan sonra ekleyebilirsiniz.
              </Text>
            )}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
