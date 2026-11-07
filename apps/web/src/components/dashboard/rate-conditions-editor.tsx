"use client";

// ---------------------------------------------------------------------------
// Dönem koşulları — dönem fiyatının yalnız belirli gecelerde (ör. Cuma-
// Cumartesi) ya da belirli konaklama sürelerinde (ör. tek gece, en az 3 gece)
// geçerli olması. Koşullu dönem, aynı tarihteki koşulsuz dönemin üstüne yazar.
// ---------------------------------------------------------------------------

import { Chip, Group, NumberInput, Stack, Text } from "@mantine/core";

/** 0 Pazar … 6 Cumartesi; panelde Pazartesi'den başlar. */
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Çar" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 0, label: "Paz" },
];

export interface RateConditions {
  weekdays: number[];
  stayMinNights: number | null;
  stayMaxNights: number | null;
}

export function hasRateConditions(c: Partial<RateConditions>): boolean {
  return Boolean(c.weekdays?.length) || c.stayMinNights != null || c.stayMaxNights != null;
}

/** "Cum, Cmt geceleri · tek gecelik konaklama" — tablo özetleri için. */
export function describeRateConditions(c: Partial<RateConditions>): string {
  const parts: string[] = [];
  if (c.weekdays?.length) {
    parts.push(`${DAYS.filter((d) => c.weekdays!.includes(d.value)).map((d) => d.label).join(", ")} geceleri`);
  }
  const min = c.stayMinNights ?? null;
  const max = c.stayMaxNights ?? null;
  if (min != null && max != null) parts.push(min === max ? `${min} gecelik konaklama` : `${min}-${max} gece konaklama`);
  else if (min != null) parts.push(`en az ${min} gece konaklama`);
  else if (max != null) parts.push(max === 1 ? "tek gecelik konaklama" : `en fazla ${max} gece konaklama`);
  return parts.join(" · ");
}

export function RateConditionsEditor({
  value,
  onChange,
}: {
  value: RateConditions;
  onChange: (next: RateConditions) => void;
}) {
  const num = (v: string | number) => (typeof v === "number" ? v : v === "" ? null : Number(v) || null);
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Koşullar <Text span size="xs" c="dimmed">(isteğe bağlı)</Text>
      </Text>
      <Text size="xs" c="dimmed">
        Boş bırakılırsa dönem her gece geçerlidir. Koşullu dönem aynı tarihteki ana dönemin üstüne
        yazar: ör. ana dönemle aynı tarihlerde &ldquo;Cum, Cmt&rdquo; seçili bir hafta sonu fiyatı.
      </Text>
      <Group gap={6} wrap="wrap" role="group" aria-label="Geçerli geceler">
        {DAYS.map((d) => (
          <Chip
            key={d.value}
            size="xs"
            checked={value.weekdays.includes(d.value)}
            onChange={(checked) =>
              onChange({
                ...value,
                weekdays: checked
                  ? [...value.weekdays, d.value].sort((a, b) => a - b)
                  : value.weekdays.filter((w) => w !== d.value),
              })
            }
          >
            {d.label}
          </Chip>
        ))}
      </Group>
      <Group grow>
        <NumberInput
          label="Konaklama en az (gece)"
          description="ör. en az 3 gece fiyatı"
          min={1}
          max={60}
          value={value.stayMinNights ?? ""}
          onChange={(v) => onChange({ ...value, stayMinNights: num(v) })}
        />
        <NumberInput
          label="Konaklama en fazla (gece)"
          description="ör. tek gece fiyatı için 1"
          min={1}
          max={60}
          value={value.stayMaxNights ?? ""}
          onChange={(v) => onChange({ ...value, stayMaxNights: num(v) })}
        />
      </Group>
    </Stack>
  );
}
