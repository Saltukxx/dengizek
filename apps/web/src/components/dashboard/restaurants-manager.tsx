"use client";

// ---------------------------------------------------------------------------
// Restoran yönetimi — bilgiler + menü kurucusu (bölümler → ürünler)
// Menü tek jsonb alanında saklanır; "Kaydet" tüm restoranı tek istekte yazar.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconPencil,
  IconPlus,
  IconToolsKitchen2,
  IconTrash,
} from "@tabler/icons-react";
import type { MenuSection } from "@/lib/db/schema";
import { formatPrice, type Currency } from "@/lib/price";
import { PriceInput } from "./price-input";
import { MediaPicker } from "./media-picker";
import { useMyHotel } from "./use-my-hotel";

interface RestaurantRow {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  hours: string | null;
  location: string | null;
  imageUrl: string | null;
  menu: MenuSection[];
  isActive: boolean;
}

const tagOptions = [
  { value: "vejetaryen", label: "Vejetaryen" },
  { value: "vegan", label: "Vegan" },
  { value: "glutensiz", label: "Glutensiz" },
  { value: "acili", label: "Acılı" },
];

interface RestaurantForm {
  name: string;
  description: string;
  cuisine: string;
  hours: string;
  location: string;
  imageUrl: string;
  menu: MenuSection[];
  isActive: boolean;
}

const emptyForm: RestaurantForm = {
  name: "",
  description: "",
  cuisine: "",
  hours: "",
  location: "",
  imageUrl: "",
  menu: [],
  isActive: true,
};

let uid = 0;
function newId(prefix: string) {
  uid += 1;
  return `${prefix}-${Date.now()}-${uid}`;
}

export function RestaurantsManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [restaurants, setRestaurants] = useState<RestaurantRow[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: RestaurantForm } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/restaurants`);
    const json = await res.json();
    if (json.ok) setRestaurants(json.restaurants);
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
  if (!hotel || !restaurants) return <Loader />;

  function patchForm(patch: Partial<RestaurantForm>) {
    setEditing((s) => s && { ...s, form: { ...s.form, ...patch } });
  }

  function patchSection(si: number, patch: Partial<MenuSection>) {
    setEditing((s) => {
      if (!s) return s;
      const menu = [...s.form.menu];
      menu[si] = { ...menu[si], ...patch };
      return { ...s, form: { ...s.form, menu } };
    });
  }

  function patchItem(si: number, ii: number, patch: Partial<MenuSection["items"][number]>) {
    setEditing((s) => {
      if (!s) return s;
      const menu = [...s.form.menu];
      const items = [...menu[si].items];
      items[ii] = { ...items[ii], ...patch };
      menu[si] = { ...menu[si], items };
      return { ...s, form: { ...s.form, menu } };
    });
  }

  async function save() {
    if (!hotel || !editing) return;
    setBusy(true);
    const f = editing.form;
    const payload = {
      name: f.name,
      description: f.description || undefined,
      cuisine: f.cuisine || undefined,
      hours: f.hours || undefined,
      location: f.location || undefined,
      imageUrl: f.imageUrl,
      menu: f.menu,
      isActive: f.isActive,
    };
    const url = editing.id
      ? `/api/manager/hotels/${hotel.id}/restaurants/${editing.id}`
      : `/api/manager/hotels/${hotel.id}/restaurants`;
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
        message: editing.id ? "Restoran güncellendi." : "Restoran oluşturuldu.",
      });
      setEditing(null);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydetme başarısız oldu." });
    }
  }

  async function removeRestaurant(r: RestaurantRow) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/restaurants/${r.id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "gray", message: "Restoran silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  const f = editing?.form;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {restaurants.length} restoran
        </Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditing({ id: null, form: emptyForm })}
        >
          Yeni restoran
        </Button>
      </Group>

      {restaurants.length === 0 && (
        <Paper withBorder p="lg">
          <Text c="dimmed" size="sm">
            Henüz restoran yok. &quot;Yeni restoran&quot; ile başlayın.
          </Text>
        </Paper>
      )}

      <Stack gap="sm">
        {restaurants.map((r) => {
          const itemCount = r.menu.reduce((n, s) => n + s.items.length, 0);
          return (
            <Paper key={r.id} withBorder p="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <IconToolsKitchen2 size={18} color="var(--mantine-color-teal-7)" />
                    <Title order={5}>{r.name}</Title>
                    {!r.isActive && <Badge color="gray">Pasif</Badge>}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {[r.cuisine, r.hours, r.location].filter(Boolean).join(" · ") || "—"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Menü: {r.menu.length} bölüm, {itemCount} ürün
                  </Text>
                </Stack>
                <Group gap={6}>
                  <Tooltip label="Düzenle">
                    <ActionIcon
                      variant="light"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          form: {
                            name: r.name,
                            description: r.description ?? "",
                            cuisine: r.cuisine ?? "",
                            hours: r.hours ?? "",
                            location: r.location ?? "",
                            imageUrl: r.imageUrl ?? "",
                            menu: r.menu,
                            isActive: r.isActive,
                          },
                        })
                      }
                    >
                      <IconPencil size={15} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Sil">
                    <ActionIcon color="red" variant="light" onClick={() => removeRestaurant(r)}>
                      <IconTrash size={15} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>

      <Drawer
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Restoranı düzenle" : "Yeni restoran"}
        position="right"
        size="xl"
        padding="lg"
      >
        {f && (
          <Stack gap="sm">
            <Group grow>
              <TextInput
                label="Restoran adı"
                value={f.name}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
              <TextInput
                label="Mutfak"
                placeholder="Akdeniz mutfağı"
                value={f.cuisine}
                onChange={(e) => patchForm({ cuisine: e.target.value })}
              />
            </Group>
            <Group grow>
              <TextInput
                label="Çalışma saatleri"
                placeholder="07:00 - 23:00"
                value={f.hours}
                onChange={(e) => patchForm({ hours: e.target.value })}
              />
              <TextInput
                label="Konum"
                placeholder="Lobi katı, deniz tarafı"
                value={f.location}
                onChange={(e) => patchForm({ location: e.target.value })}
              />
            </Group>
            <Textarea
              label="Açıklama"
              autosize
              minRows={2}
              value={f.description}
              onChange={(e) => patchForm({ description: e.target.value })}
            />
            <MediaPicker
              hotelId={hotel.id}
              value={f.imageUrl}
              onChange={(url) => patchForm({ imageUrl: url })}
            />
            <Switch
              label="Restoran misafir sayfasında görünsün"
              checked={f.isActive}
              onChange={(e) => patchForm({ isActive: e.currentTarget.checked })}
            />

            <Divider
              label={`Menü — ${f.menu.length} bölüm`}
              labelPosition="left"
              mt="sm"
            />

            <Accordion variant="separated" multiple>
              {f.menu.map((section, si) => (
                <Accordion.Item key={section.id} value={section.id}>
                  <Accordion.Control>
                    <Group gap="xs">
                      <Text fw={600}>{section.title || "Adsız bölüm"}</Text>
                      <Text size="xs" c="dimmed">
                        {section.items.length} ürün
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Group align="flex-end" gap="xs">
                        <TextInput
                          label="Bölüm başlığı"
                          placeholder="Başlangıçlar"
                          value={section.title}
                          onChange={(e) => patchSection(si, { title: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <Tooltip label="Bölümü sil">
                          <ActionIcon
                            color="red"
                            variant="light"
                            mb={4}
                            onClick={() =>
                              patchForm({ menu: f.menu.filter((_, x) => x !== si) })
                            }
                          >
                            <IconTrash size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>

                      {section.items.map((item, ii) => (
                        <Paper key={item.id} withBorder p="sm">
                          <Stack gap="xs">
                            <Group align="flex-end" gap="xs">
                              <TextInput
                                label="Ürün adı"
                                value={item.name}
                                onChange={(e) => patchItem(si, ii, { name: e.target.value })}
                                style={{ flex: 1 }}
                              />
                              <Tooltip label="Ürünü sil">
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  mb={4}
                                  onClick={() =>
                                    patchSection(si, {
                                      items: section.items.filter((_, x) => x !== ii),
                                    })
                                  }
                                >
                                  <IconTrash size={15} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                            <TextInput
                              label="Açıklama"
                              value={item.description ?? ""}
                              onChange={(e) =>
                                patchItem(si, ii, { description: e.target.value || undefined })
                              }
                            />
                            <Group align="flex-end" gap="md" wrap="wrap">
                              <PriceInput
                                value={{
                                  priceMinor: item.priceMinor ?? null,
                                  currency: (item.currency || "TRY") as Currency,
                                  priceOnRequest: item.priceOnRequest,
                                }}
                                onChange={(p) =>
                                  patchItem(si, ii, {
                                    priceMinor: p.priceMinor,
                                    currency: p.currency,
                                    priceOnRequest: p.priceOnRequest,
                                  })
                                }
                              />
                              <MultiSelect
                                label="Etiketler"
                                data={tagOptions}
                                value={item.tags}
                                onChange={(tags) => patchItem(si, ii, { tags })}
                                w={260}
                              />
                            </Group>
                            <Text size="xs" c="dimmed">
                              Önizleme:{" "}
                              {formatPrice(item.priceMinor, item.currency, item.priceOnRequest)}
                            </Text>
                          </Stack>
                        </Paper>
                      ))}

                      <Button
                        size="xs"
                        variant="default"
                        w="fit-content"
                        leftSection={<IconPlus size={14} />}
                        onClick={() =>
                          patchSection(si, {
                            items: [
                              ...section.items,
                              {
                                id: newId("urun"),
                                name: "",
                                currency: "TRY",
                                priceOnRequest: true,
                                tags: [],
                              },
                            ],
                          })
                        }
                      >
                        Ürün ekle
                      </Button>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>

            <Button
              variant="default"
              w="fit-content"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                patchForm({
                  menu: [...f.menu, { id: newId("bolum"), title: "", items: [] }],
                })
              }
            >
              Menü bölümü ekle
            </Button>

            <Button loading={busy} onClick={save} mt="xs">
              {editing?.id ? "Kaydet" : "Oluştur"}
            </Button>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
