"use client";

// ---------------------------------------------------------------------------
// Ekstra hizmet yönetimi — tablo + modal editör
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  extraCategories,
  extraCategoryLabels,
} from "@/lib/schemas/hotel-content";
import { applyDiscount, formatPrice, type Currency } from "@/lib/price";
import { PriceInput, type PriceValue } from "./price-input";
import { MediaPicker } from "./media-picker";
import { useMyHotel } from "./use-my-hotel";

interface ExtraRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unitLabel: string | null;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  discountPercent: number | null;
  discountLabel: string | null;
  isActive: boolean;
}

interface ExtraForm {
  name: string;
  description: string;
  category: string;
  unitLabel: string;
  imageUrl: string;
  price: PriceValue;
  discountPercent: number | null;
  discountLabel: string;
  isActive: boolean;
}

const emptyForm: ExtraForm = {
  name: "",
  description: "",
  category: "diger",
  unitLabel: "",
  imageUrl: "",
  price: { priceMinor: null, currency: "TRY", priceOnRequest: true },
  discountPercent: null,
  discountLabel: "",
  isActive: true,
};

export function ExtrasManager() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [extras, setExtras] = useState<ExtraRow[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: ExtraForm } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/extras`);
    const json = await res.json();
    if (json.ok) setExtras(json.extras);
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
  if (!hotel || !extras) return <Loader />;

  async function save() {
    if (!hotel || !editing) return;
    setBusy(true);
    const f = editing.form;
    const payload = {
      name: f.name,
      description: f.description || undefined,
      category: f.category,
      unitLabel: f.unitLabel || undefined,
      imageUrl: f.imageUrl,
      priceMinor: f.price.priceMinor,
      currency: f.price.currency,
      priceOnRequest: f.price.priceOnRequest,
      discountPercent: f.discountPercent,
      discountLabel: f.discountLabel || undefined,
      isActive: f.isActive,
    };
    const url = editing.id
      ? `/api/manager/hotels/${hotel.id}/extras/${editing.id}`
      : `/api/manager/hotels/${hotel.id}/extras`;
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
        message: editing.id ? "Hizmet güncellendi." : "Hizmet oluşturuldu.",
      });
      setEditing(null);
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Kaydetme başarısız oldu." });
    }
  }

  async function removeExtra(extra: ExtraRow) {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/extras/${extra.id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "gray", message: "Hizmet silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (!hotel || !extras) return;
    const target = index + delta;
    if (target < 0 || target >= extras.length) return;
    const next = [...extras];
    [next[index], next[target]] = [next[target], next[index]];
    setExtras(next);
    await fetch(`/api/manager/hotels/${hotel.id}/extras/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sirali: next.map((x) => x.id) }),
    });
  }

  const f = editing?.form;

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditing({ id: null, form: emptyForm })}
        >
          Yeni hizmet
        </Button>
      </Group>

      <Paper withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>Hizmet</Table.Th>
              <Table.Th>Kategori</Table.Th>
              <Table.Th>Fiyat</Table.Th>
              <Table.Th>Aktif</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {extras.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz ek hizmet yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {extras.map((x, index) => (
              <Table.Tr key={x.id}>
                <Table.Td>
                  <Group gap={4}>
                    <Tooltip label="Yukarı">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <IconArrowUp size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Aşağı">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        disabled={index === extras.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <IconArrowDown size={15} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text fw={500}>{x.name}</Text>
                  {x.description && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {x.description}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {extraCategoryLabels[x.category as keyof typeof extraCategoryLabels] ??
                      x.category}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600} c="indigo.7">
                    {x.discountPercent && !x.priceOnRequest && x.priceMinor != null ? (
                      <>
                        <Text span size="xs" c="dimmed" td="line-through" fw={400}>
                          {formatPrice(x.priceMinor, x.currency, false)}
                        </Text>{" "}
                        {formatPrice(
                          applyDiscount(x.priceMinor, x.discountPercent),
                          x.currency,
                          false,
                        )}
                      </>
                    ) : (
                      formatPrice(x.priceMinor, x.currency, x.priceOnRequest)
                    )}
                  </Text>
                  {x.discountPercent && !x.priceOnRequest ? (
                    <Badge color="red" size="xs" variant="light">
                      %{x.discountPercent} indirim
                    </Badge>
                  ) : null}
                  {x.unitLabel && (
                    <Text size="xs" c="dimmed">
                      {x.unitLabel}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={x.isActive ? "green" : "gray"}>
                    {x.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} justify="flex-end">
                    <Tooltip label="Düzenle">
                      <ActionIcon
                        variant="light"
                        onClick={() =>
                          setEditing({
                            id: x.id,
                            form: {
                              name: x.name,
                              description: x.description ?? "",
                              category: x.category,
                              unitLabel: x.unitLabel ?? "",
                              imageUrl: x.imageUrl ?? "",
                              price: {
                                priceMinor: x.priceMinor,
                                currency: (x.currency || "TRY") as Currency,
                                priceOnRequest: x.priceOnRequest,
                              },
                              discountPercent: x.discountPercent,
                              discountLabel: x.discountLabel ?? "",
                              isActive: x.isActive,
                            },
                          })
                        }
                      >
                        <IconPencil size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Sil">
                      <ActionIcon color="red" variant="light" onClick={() => removeExtra(x)}>
                        <IconTrash size={15} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Hizmeti düzenle" : "Yeni hizmet"}
        size="lg"
      >
        {f && (
          <Stack gap="sm">
            <TextInput
              label="Hizmet adı"
              placeholder="Havalimanı transferi"
              value={f.name}
              onChange={(e) =>
                setEditing((s) => s && { ...s, form: { ...s.form, name: e.target.value } })
              }
            />
            <Textarea
              label="Açıklama"
              autosize
              minRows={2}
              value={f.description}
              onChange={(e) =>
                setEditing(
                  (s) => s && { ...s, form: { ...s.form, description: e.target.value } },
                )
              }
            />
            <Group grow>
              <Select
                label="Kategori"
                data={extraCategories.map((c) => ({
                  value: c,
                  label: extraCategoryLabels[c],
                }))}
                value={f.category}
                onChange={(v) =>
                  v && setEditing((s) => s && { ...s, form: { ...s.form, category: v } })
                }
              />
              <TextInput
                label="Birim"
                placeholder="kişi başı / gecelik / araç başına"
                value={f.unitLabel}
                onChange={(e) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, unitLabel: e.target.value } },
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
            <PriceInput
              value={f.price}
              onChange={(price) =>
                setEditing((s) => s && { ...s, form: { ...s.form, price } })
              }
            />
            <Group grow align="flex-end">
              <NumberInput
                label="İndirim (%)"
                min={1}
                max={90}
                disabled={f.price.priceOnRequest}
                value={f.discountPercent ?? ""}
                onChange={(v) =>
                  setEditing(
                    (s) =>
                      s && {
                        ...s,
                        form: {
                          ...s.form,
                          discountPercent: typeof v === "number" ? v : null,
                        },
                      },
                  )
                }
              />
              <TextInput
                label="İndirim etiketi"
                placeholder="Konaklayan misafire özel"
                disabled={f.price.priceOnRequest || !f.discountPercent}
                value={f.discountLabel}
                onChange={(e) =>
                  setEditing(
                    (s) => s && { ...s, form: { ...s.form, discountLabel: e.target.value } },
                  )
                }
              />
            </Group>
            <Switch
              label="Hizmet misafir sayfasında görünsün"
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
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
