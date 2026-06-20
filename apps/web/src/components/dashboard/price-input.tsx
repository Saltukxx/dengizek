"use client";

// ---------------------------------------------------------------------------
// Ortak fiyat girişi — tutar (ana birim) + para birimi + "Talep üzerine"
// Değer her zaman en küçük birimde (kuruş/cent) tutulur.
// ---------------------------------------------------------------------------

import { Group, NumberInput, Select, Switch } from "@mantine/core";
import { currencies, currencyLabels, toMajor, toMinor, type Currency } from "@/lib/price";

export interface PriceValue {
  priceMinor: number | null;
  currency: Currency;
  priceOnRequest: boolean;
}

export function PriceInput({
  value,
  onChange,
  label = "Fiyat",
}: {
  value: PriceValue;
  onChange: (v: PriceValue) => void;
  label?: string;
}) {
  return (
    <Group align="flex-end" gap="sm" wrap="wrap">
      <NumberInput
        label={label}
        placeholder="0"
        min={0}
        decimalScale={2}
        thousandSeparator="."
        decimalSeparator=","
        disabled={value.priceOnRequest}
        value={value.priceMinor === null ? "" : toMajor(value.priceMinor)}
        onChange={(v) =>
          onChange({
            ...value,
            priceMinor: typeof v === "number" ? toMinor(v) : null,
          })
        }
        w={160}
      />
      <Select
        label="Para birimi"
        data={currencies.map((c) => ({ value: c, label: currencyLabels[c] }))}
        disabled={value.priceOnRequest}
        value={value.currency}
        onChange={(v) => v && onChange({ ...value, currency: v as Currency })}
        w={170}
      />
      <Switch
        label="Talep üzerine"
        checked={value.priceOnRequest}
        onChange={(e) => onChange({ ...value, priceOnRequest: e.currentTarget.checked })}
        mb={8}
      />
    </Group>
  );
}
