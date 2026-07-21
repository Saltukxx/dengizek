"use client";

import { Button, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { childPriceModeLabels, type ChildAgePriceForm, type ChildPriceMode } from "@/lib/child-price";

const modeOptions = Object.entries(childPriceModeLabels).map(([value, label]) => ({ value, label }));

export function ChildAgePricesEditor({
  value,
  onChange,
}: {
  value: ChildAgePriceForm[];
  onChange: (next: ChildAgePriceForm[]) => void;
}) {
  function patch(index: number, patch: Partial<ChildAgePriceForm>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const used = value.map((v) => v.ageTo).filter((n): n is number => n != null);
    const nextFrom = used.length > 0 ? Math.min(17, Math.max(...used) + 1) : 0;
    onChange([
      ...value,
      { ageFrom: nextFrom, ageTo: Math.min(17, nextFrom + 5), mode: "ucretsiz", priceMajor: null, percent: null },
    ]);
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Yaş aralığına göre çocuk fiyatı tanımlayın (0-17 yaş). Eşleşme yoksa çocuk, yetişkin
        fiyatından ücretlendirilir.
      </Text>
      {value.length === 0 && (
        <Text size="sm" c="dimmed">
          Henüz çocuk fiyatı yok.
        </Text>
      )}
      {value.map((row, i) => (
        <Group key={`child-${i}`} align="flex-end" wrap="wrap">
          <NumberInput
            label={i === 0 ? "Yaştan" : undefined}
            min={0}
            max={17}
            value={row.ageFrom ?? ""}
            onChange={(v) =>
              patch(i, { ageFrom: v === "" || v == null ? null : typeof v === "number" ? v : Number(v) })
            }
            w={90}
          />
          <NumberInput
            label={i === 0 ? "Yaşa kadar" : undefined}
            min={0}
            max={17}
            value={row.ageTo ?? ""}
            onChange={(v) =>
              patch(i, { ageTo: v === "" || v == null ? null : typeof v === "number" ? v : Number(v) })
            }
            w={90}
          />
          <Select
            label={i === 0 ? "Ücretlendirme" : undefined}
            data={modeOptions}
            value={row.mode}
            onChange={(v) => v && patch(i, { mode: v as ChildPriceMode })}
            w={200}
            allowDeselect={false}
          />
          {row.mode === "sabit" && (
            <NumberInput
              label={i === 0 ? "Gecelik tutar" : undefined}
              min={0}
              decimalScale={2}
              thousandSeparator="."
              decimalSeparator=","
              value={row.priceMajor ?? ""}
              onChange={(v) =>
                patch(i, { priceMajor: v === "" || v == null ? null : typeof v === "number" ? v : Number(v) })
              }
              style={{ flex: 1, minWidth: 120 }}
            />
          )}
          {row.mode === "yuzde" && (
            <NumberInput
              label={i === 0 ? "Yüzde" : undefined}
              min={1}
              max={100}
              suffix="%"
              value={row.percent ?? ""}
              onChange={(v) =>
                patch(i, { percent: v === "" || v == null ? null : typeof v === "number" ? v : Number(v) })
              }
              style={{ flex: 1, minWidth: 100 }}
            />
          )}
          <Button
            color="red"
            variant="light"
            mb={4}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Çocuk fiyatını kaldır"
          >
            <IconTrash size={14} />
          </Button>
        </Group>
      ))}
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addRow}>
        Yaş aralığı ekle
      </Button>
    </Stack>
  );
}
