"use client";

// ---------------------------------------------------------------------------
// Tesis formu — otel bilgilerini ve AI profilini düzenler.
// Kaydet: PATCH /api/manager/hotels/[id]
// İncelemeye gönder: POST /api/manager/hotels/[id]/submit
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconSend } from "@tabler/icons-react";
import { amenitiesCatalog, amenityLabel } from "@/lib/amenities-catalog";
import {
  paymentMethodLabels,
  paymentMethods,
} from "@/lib/schemas/hotel-content";
import { moderationStatusColors, moderationStatusLabels, propertyTypeLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";
import { MediaPicker } from "./media-picker";
import { PropertyGallerySection } from "./property-gallery-section";

// TagsInput önerileri — katalog kategorilere göre gruplanır, serbest metin de geçerli
const amenitySuggestions = amenitiesCatalog.map((cat) => ({
  group: cat.category,
  items: cat.items.map((i) => i.key),
}));

interface HotelDetail {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  priceLabel: string | null;
  aiPersona: string;
  aiLanguage: string;
  aiFacts: string[];
  aiPolicies: string[];
  starRating: number | null;
  totalRooms: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  amenities: string[];
  cancellationPolicy: string | null;
  childPolicy: string | null;
  petsAllowed: boolean | null;
  paymentMethods: string[];
  address: string | null;
  phone: string | null;
  contactEmail: string | null;
  airportDistanceKm: number | null;
  latitude: string | null;
  longitude: string | null;
  propertyType: "otel" | "apart" | "villa" | "butik" | "pansiyon" | "diger" | null;
  blackoutText: string | null;
  cancellationRuleId: string | null;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
}

export function PropertyForm() {
  const { hotel: myHotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [detail, setDetail] = useState<HotelDetail | null>(null);
  const [cancellationRules, setCancellationRules] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!myHotel) return;
    (async () => {
      const [hotelRes, rulesRes] = await Promise.all([
        fetch(`/api/manager/hotels/${myHotel.id}`),
        fetch(`/api/manager/hotels/${myHotel.id}/cancellation-rules`),
      ]);
      const json = await hotelRes.json();
      const rulesJson = await rulesRes.json();
      if (json.ok) setDetail(json.hotel);
      if (rulesJson.ok) setCancellationRules(rulesJson.rules);
    })();
  }, [myHotel]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!detail) return <Loader />;

  function set<K extends keyof HotelDetail>(key: K, value: HotelDetail[K]) {
    setDetail((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!detail) return;
    setSaving(true);
    const res = await fetch(`/api/manager/hotels/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: detail.name,
        city: detail.city ?? undefined,
        country: detail.country ?? undefined,
        shortDescription: detail.shortDescription ?? undefined,
        longDescription: detail.longDescription ?? undefined,
        imageUrl: detail.imageUrl ?? undefined,
        priceLabel: detail.priceLabel ?? undefined,
        aiPersona: detail.aiPersona,
        aiLanguage: detail.aiLanguage,
        aiFacts: detail.aiFacts,
        aiPolicies: detail.aiPolicies,
        starRating: detail.starRating,
        totalRooms: detail.totalRooms,
        checkInTime: detail.checkInTime ?? "",
        checkOutTime: detail.checkOutTime ?? "",
        amenities: detail.amenities,
        cancellationPolicy: detail.cancellationPolicy ?? undefined,
        childPolicy: detail.childPolicy ?? undefined,
        petsAllowed: detail.petsAllowed,
        paymentMethods: detail.paymentMethods,
        address: detail.address ?? undefined,
        phone: detail.phone ?? undefined,
        contactEmail: detail.contactEmail ?? "",
        airportDistanceKm: detail.airportDistanceKm,
        latitude: detail.latitude ?? "",
        longitude: detail.longitude ?? "",
        propertyType: detail.propertyType ?? "otel",
        blackoutText: detail.blackoutText ?? undefined,
        cancellationRuleId: detail.cancellationRuleId,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      notifications.show({ color: "green", message: "Tesis bilgileri güncellendi." });
      setDetail(json.hotel);
    } else {
      notifications.show({
        color: "red",
        message: json.error ?? "Kaydetme başarısız oldu.",
      });
    }
  }

  async function submitForReview() {
    if (!detail) return;
    setSubmitting(true);
    const res = await fetch(`/api/manager/hotels/${detail.id}/submit`, { method: "POST" });
    const json = await res.json();
    setSubmitting(false);
    if (json.ok) {
      notifications.show({ color: "blue", message: "Tesis incelemeye gönderildi." });
      set("status", json.status);
    } else {
      notifications.show({ color: "red", message: json.error ?? "Gönderme başarısız oldu." });
    }
  }

  const canSubmit = detail.status === "taslak" || detail.status === "reddedildi";

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={3}>{detail.name}</Title>
          <Badge color={moderationStatusColors[detail.status]}>
            {moderationStatusLabels[detail.status]}
          </Badge>
        </Group>
        <Group gap="xs">
          {canSubmit && (
            <Button
              variant="light"
              leftSection={<IconSend size={16} />}
              loading={submitting}
              onClick={submitForReview}
            >
              İncelemeye gönder
            </Button>
          )}
          <Button loading={saving} onClick={save}>
            Kaydet
          </Button>
        </Group>
      </Group>

      {detail.status === "reddedildi" && detail.moderationNote && (
        <Alert color="red" title="Reddedilme nedeni" icon={<IconAlertCircle size={16} />}>
          {detail.moderationNote}
        </Alert>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={5}>Temel bilgiler</Title>
          <TextInput
            label="Tesis adı"
            value={detail.name}
            onChange={(e) => set("name", e.currentTarget.value)}
          />
          <Group grow>
            <TextInput
              label="Şehir"
              value={detail.city ?? ""}
              onChange={(e) => set("city", e.currentTarget.value)}
            />
            <TextInput
              label="Ülke"
              value={detail.country ?? ""}
              onChange={(e) => set("country", e.currentTarget.value)}
            />
          </Group>
          <Select
            label="Tesis türü"
            data={Object.entries(propertyTypeLabels).map(([v, l]) => ({ value: v, label: l }))}
            value={detail.propertyType ?? "otel"}
            onChange={(v) =>
              set("propertyType", (v ?? "otel") as HotelDetail["propertyType"])
            }
          />
          <Group grow>
            <TextInput
              label="Enlem"
              placeholder="36.8841"
              value={detail.latitude ?? ""}
              onChange={(e) => set("latitude", e.currentTarget.value || null)}
            />
            <TextInput
              label="Boylam"
              placeholder="30.7056"
              value={detail.longitude ?? ""}
              onChange={(e) => set("longitude", e.currentTarget.value || null)}
            />
          </Group>
          <Textarea
            label="Kapalı dönem metni"
            description="Misafir sayfasında gösterilecek genel müsaitlik uyarısı"
            autosize
            minRows={2}
            value={detail.blackoutText ?? ""}
            onChange={(e) => set("blackoutText", e.currentTarget.value || null)}
          />
          <MediaPicker
            hotelId={detail.id}
            label="Kapak görseli"
            value={detail.imageUrl ?? ""}
            onChange={(url) => set("imageUrl", url || null)}
          />
          <TextInput
            label="Fiyat etiketi"
            description='Örn: "Talep üzerine" veya "₺4.500 / gece"'
            value={detail.priceLabel ?? ""}
            onChange={(e) => set("priceLabel", e.currentTarget.value)}
          />
          <Textarea
            label="Kısa açıklama"
            autosize
            minRows={2}
            value={detail.shortDescription ?? ""}
            onChange={(e) => set("shortDescription", e.currentTarget.value)}
          />
          <Textarea
            label="Uzun açıklama"
            autosize
            minRows={4}
            value={detail.longDescription ?? ""}
            onChange={(e) => set("longDescription", e.currentTarget.value)}
          />
        </Stack>
      </Paper>

      <PropertyGallerySection hotelId={detail.id} />

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={5}>Otel özellikleri</Title>
          <Text size="sm" c="dimmed">
            Misafir sayfasında ve AI rehberde gösterilen temel tesis bilgileri.
          </Text>
          <Group grow>
            <NumberInput
              label="Yıldız sayısı"
              min={1}
              max={5}
              value={detail.starRating ?? ""}
              onChange={(v) => set("starRating", typeof v === "number" ? v : null)}
            />
            <NumberInput
              label="Toplam oda sayısı"
              min={1}
              max={10000}
              value={detail.totalRooms ?? ""}
              onChange={(v) => set("totalRooms", typeof v === "number" ? v : null)}
            />
          </Group>
          <Group grow>
            <TextInput
              label="Check-in saati"
              placeholder="14:00"
              value={detail.checkInTime ?? ""}
              onChange={(e) => set("checkInTime", e.currentTarget.value)}
            />
            <TextInput
              label="Check-out saati"
              placeholder="12:00"
              value={detail.checkOutTime ?? ""}
              onChange={(e) => set("checkOutTime", e.currentTarget.value)}
            />
          </Group>
          <TagsInput
            label="Otel olanakları"
            description="Listeden seçin veya kendi olanağınızı yazıp Enter'a basın"
            data={amenitySuggestions}
            value={detail.amenities}
            onChange={(v) => set("amenities", v)}
            renderOption={({ option }) => <span>{amenityLabel(option.value)}</span>}
            maxTags={100}
            clearable
          />
          {detail.amenities.length > 0 && (
            <Group gap={6}>
              {detail.amenities.map((key) => (
                <Badge key={key} variant="light" color="gray" size="sm">
                  {amenityLabel(key)}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={5}>Politikalar ve iletişim</Title>
          <Text size="sm" c="dimmed">
            Misafir sayfasındaki &quot;Bilmeniz Gerekenler&quot; bölümünü ve AI rehberi besler.
          </Text>
          <Textarea
            label="İptal politikası"
            description="Serbest metin — yapılandırılmış kural seçilmezse misafir sayfasında gösterilir"
            placeholder="Rezervasyondan 48 saat öncesine kadar ücretsiz iptal..."
            autosize
            minRows={2}
            value={detail.cancellationPolicy ?? ""}
            onChange={(e) => set("cancellationPolicy", e.currentTarget.value)}
          />
          <Select
            label="İptal kuralı"
            description="Tanımlı kurallardan birini tesis varsayılanı olarak seçin"
            placeholder="Seçin (opsiyonel)"
            clearable
            data={cancellationRules.map((r) => ({ value: r.id, label: r.name }))}
            value={detail.cancellationRuleId}
            onChange={(v) => set("cancellationRuleId", v)}
          />
          <Textarea
            label="Çocuk politikası"
            placeholder="0-6 yaş ücretsiz, 7-12 yaş %50 indirimli..."
            autosize
            minRows={2}
            value={detail.childPolicy ?? ""}
            onChange={(e) => set("childPolicy", e.currentTarget.value)}
          />
          <Group grow align="flex-end">
            <div>
              <Text size="sm" fw={500} mb={4}>
                Evcil hayvan
              </Text>
              <SegmentedControl
                fullWidth
                size="xs"
                data={[
                  { value: "belirtilmedi", label: "Belirtilmedi" },
                  { value: "evet", label: "Kabul edilir" },
                  { value: "hayir", label: "Kabul edilmez" },
                ]}
                value={
                  detail.petsAllowed === null
                    ? "belirtilmedi"
                    : detail.petsAllowed
                      ? "evet"
                      : "hayir"
                }
                onChange={(v) =>
                  set("petsAllowed", v === "belirtilmedi" ? null : v === "evet")
                }
              />
            </div>
            <MultiSelect
              label="Ödeme yöntemleri"
              data={paymentMethods.map((m) => ({ value: m, label: paymentMethodLabels[m] }))}
              value={detail.paymentMethods}
              onChange={(v) => set("paymentMethods", v)}
            />
          </Group>
          <TextInput
            label="Adres"
            value={detail.address ?? ""}
            onChange={(e) => set("address", e.currentTarget.value)}
          />
          <Group grow>
            <TextInput
              label="Telefon"
              placeholder="+90 ..."
              value={detail.phone ?? ""}
              onChange={(e) => set("phone", e.currentTarget.value)}
            />
            <TextInput
              label="İletişim e-postası"
              placeholder="rezervasyon@otel.com"
              value={detail.contactEmail ?? ""}
              onChange={(e) => set("contactEmail", e.currentTarget.value)}
            />
            <NumberInput
              label="Havalimanına mesafe (km)"
              min={0}
              max={500}
              value={detail.airportDistanceKm ?? ""}
              onChange={(v) =>
                set("airportDistanceKm", typeof v === "number" ? v : null)
              }
            />
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={5}>Yapay Zeka Rehberi profili</Title>
          <Text size="sm" c="dimmed">
            AI rehber yalnızca buradaki gerçekleri ve politikaları kullanır — asla uydurmaz.
          </Text>
          <Group grow>
            <TextInput
              label="Persona adı"
              value={detail.aiPersona}
              onChange={(e) => set("aiPersona", e.currentTarget.value)}
            />
            <TextInput
              label="Dil"
              description="BCP-47 (örn. tr)"
              value={detail.aiLanguage}
              onChange={(e) => set("aiLanguage", e.currentTarget.value)}
            />
          </Group>
          <TagsInput
            label="Otel gerçekleri"
            description="Enter ile ekleyin — örn. '5 yıldız otel', '200 oda kapasitesi'"
            value={detail.aiFacts}
            onChange={(v) => set("aiFacts", v)}
          />
          <TagsInput
            label="Politikalar"
            description="Örn. 'Check-in saati: 14:00'"
            value={detail.aiPolicies}
            onChange={(v) => set("aiPolicies", v)}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
