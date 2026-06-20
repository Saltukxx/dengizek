"use client";

import { Button, Group, NumberInput, Stack, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { OccupancyPriceForm } from "@/lib/occupancy-price";

export function OccupancyPricesEditor({
  value,
  onChange,
  capacityAdults,
}: {
  value: OccupancyPriceForm[];
  onChange: (next: OccupancyPriceForm[]) => void;
  capacityAdults?: number;
}) {
  function patch(index: number, patch: Partial<OccupancyPriceForm>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const used = new Set(value.map((v) => v.guestCount).filter((n): n is number => n != null));
    let nextCount = capacityAdults && capacityAdults > 0 ? capacityAdults : 2;
    while (used.has(nextCount) && nextCount <= 20) nextCount += 1;
    onChange([...value, { guestCount: nextCount <= 20 ? nextCount : null, priceMajor: null }]);
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Her kişi sayısı için gecelik fiyat tanımlayın. Eşleşme yoksa baz fiyat kullanılır.
      </Text>
      {value.length === 0 && (
        <Text size="sm" c="dimmed">
          Henüz kişi fiyatı yok.
        </Text>
      )}
      {value.map((row, i) => (
        <Group key={`occ-${i}`} align="flex-end" wrap="nowrap">
          <NumberInput
            label={i === 0 ? "Kişi sayısı" : undefined}
            min={1}
            max={20}
            value={row.guestCount ?? ""}
            onChange={(v) =>
              patch(i, {
                guestCount: v === "" || v == null ? null : typeof v === "number" ? v : Number(v),
              })
            }
            w={110}
          />
          <NumberInput
            label={i === 0 ? "Gecelik fiyat" : undefined}
            min={0}
            decimalScale={2}
            value={row.priceMajor ?? ""}
            onChange={(v) =>
              patch(i, {
                priceMajor: v === "" || v == null ? null : typeof v === "number" ? v : Number(v),
              })
            }
            thousandSeparator="."
            decimalSeparator=","
            style={{ flex: 1 }}
          />
          <Button
            color="red"
            variant="light"
            mb={4}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Kişi fiyatını kaldır"
          >
            <IconTrash size={14} />
          </Button>
        </Group>
      ))}
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addRow}>
        Kişi fiyatı ekle
      </Button>
    </Stack>
  );
}
