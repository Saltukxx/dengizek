"use client";

// ---------------------------------------------------------------------------
// Admin analitiği için sade grafik parçaları: zaman serisi alan grafiği
// (hover ile) ve sıralı çubuk listesi. Tek vurgu rengi; kimlik etikette,
// büyüklük çubukta/alanda. Mantine renk değişkenleriyle temaya uyumlu.
// ---------------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { Box, Group, Paper, Stack, Text } from "@mantine/core";

const ACCENT = "var(--mantine-color-indigo-6)";
const GRID = "var(--mantine-color-gray-3)";

// ---------------------------------------------------------------------------
// Paylaşılan panel parçaları — tüm analitik kartları aynı dili konuşsun.
// ---------------------------------------------------------------------------

/** Standart kart: başlık + açıklama + opsiyonel sağ slot. */
export function PanelCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb={subtitle ? 4 : "md"}>
        <Text fw={600}>{title}</Text>
        {right}
      </Group>
      {subtitle && (
        <Text size="xs" c="dimmed" mb="md">
          {subtitle}
        </Text>
      )}
      {children}
    </Paper>
  );
}

/** Küçük büyük-harf bölüm başlığı. */
export function SubHead({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts="0.05em" mb={8}>
      {children}
    </Text>
  );
}

/** Özet çip satırı: etiket + büyük rakam (meta satırı yerine). */
export function StatChips({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <Group gap="xl" wrap="wrap">
      {items.map((it) => (
        <div key={it.label}>
          <Text
            fw={700}
            lh={1.1}
            style={{ fontSize: 20, fontVariantNumeric: "tabular-nums", color: it.accent ? ACCENT : undefined }}
          >
            {it.value}
          </Text>
          <Text size="xs" c="dimmed">
            {it.label}
          </Text>
        </div>
      ))}
    </Group>
  );
}

/** Sağa hizalı sayı pili. */
export function CountPill({ value, tone = "default" }: { value: ReactNode; tone?: "default" | "orange" | "red" }) {
  const palette = {
    default: { bg: "var(--mantine-color-gray-1)", fg: "var(--mantine-color-dark-5)" },
    orange: { bg: "var(--mantine-color-orange-0)", fg: "var(--mantine-color-orange-7)" },
    red: { bg: "var(--mantine-color-red-0)", fg: "var(--mantine-color-red-7)" },
  }[tone];
  return (
    <Box
      style={{
        flexShrink: 0,
        background: palette.bg,
        color: palette.fg,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 13,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.5,
      }}
    >
      {value}
    </Box>
  );
}

/** Numaralı sıralı liste: birincil metin + opsiyonel ikincil satır + sağ pil. */
export function RankedList({
  items,
  numbered = true,
  tone = "default",
  empty = "Veri yok.",
}: {
  items: { key: string; primary: ReactNode; secondary?: ReactNode; value: ReactNode }[];
  numbered?: boolean;
  tone?: "default" | "orange" | "red";
  empty?: string;
}) {
  if (!items.length) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      {items.map((it, i) => (
        <Group
          key={it.key}
          justify="space-between"
          wrap="nowrap"
          gap="sm"
          align="flex-start"
          py={8}
          style={{ borderTop: i === 0 ? undefined : "1px solid var(--mantine-color-gray-1)" }}
        >
          <Group gap={8} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
            {numbered && (
              <Text size="xs" c="dimmed" fw={700} w={16} style={{ flexShrink: 0, lineHeight: 1.6 }}>
                {i + 1}
              </Text>
            )}
            <div style={{ minWidth: 0 }}>
              <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                {it.primary}
              </Text>
              {it.secondary && (
                <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                  {it.secondary}
                </Text>
              )}
            </div>
          </Group>
          <CountPill value={it.value} tone={tone} />
        </Group>
      ))}
    </Stack>
  );
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Dönem boyunca günlük olay eğrisi — alan grafiği + crosshair tooltip. */
export function TrendChart({
  data,
  height = 180,
}: {
  data: { day: string; count: number }[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Bu dönemde veri yok.
      </Text>
    );
  }

  const W = 760;
  const H = height;
  const padT = 14;
  const padB = 26;
  const padX = 8;
  const innerW = W - padX * 2;
  const innerH = H - padT - padB;

  const max = Math.max(...data.map((d) => d.count), 1);
  const n = data.length;
  const x = (i: number) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const areaPath = `M ${x(0)},${padT + innerH} L ${data
    .map((d, i) => `${x(i)},${y(d.count)}`)
    .join(" L ")} L ${x(n - 1)},${padT + innerH} Z`;

  // Dört yatay kılavuz; üst değer etiketlenir.
  const gridVals = [0, 0.5, 1].map((f) => Math.round(max * f));

  const total = data.reduce((s, d) => s + d.count, 0);
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    setHover(i);
  }

  const active = hover != null ? data[hover] : null;
  const activeX = hover != null ? (x(hover) / W) * 100 : 0;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
        role="img"
        aria-label="Günlük olay eğrisi"
      >
        {gridVals.map((v) => (
          <line
            key={v}
            x1={padX}
            x2={W - padX}
            y1={y(v)}
            y2={y(v)}
            stroke={GRID}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trend-fill)" stroke="none" />
        <polyline
          points={linePts}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke={ACCENT}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Hover noktası HTML katmanında — SVG'nin yatay ölçeğinden etkilenip
          elipse dönüşmesin (dikey ölçek 1:1 olduğundan top px doğru). */}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${activeX}%`,
            top: y(data[hover].count),
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: ACCENT,
            border: "2px solid white",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Üst değer + eksen etiketleri (SVG dışında, keskin metin) */}
      <Text
        size="xs"
        c="dimmed"
        style={{ position: "absolute", top: 0, left: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {max.toLocaleString("tr-TR")}
      </Text>
      <Group justify="space-between" mt={4}>
        <Text size="xs" c="dimmed">
          {formatDay(data[0].day)}
        </Text>
        {n > 2 && (
          <Text size="xs" c="dimmed">
            {formatDay(data[Math.floor(n / 2)].day)}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {formatDay(data[n - 1].day)}
        </Text>
      </Group>

      {active && (
        <Paper
          withBorder
          shadow="sm"
          px="sm"
          py={6}
          radius="sm"
          style={{
            position: "absolute",
            top: -6,
            left: `clamp(0px, calc(${activeX}% - 60px), calc(100% - 120px))`,
            width: 120,
            pointerEvents: "none",
          }}
        >
          <Text size="xs" c="dimmed">
            {formatDay(active.day)}
          </Text>
          <Text size="sm" fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
            {active.count.toLocaleString("tr-TR")} olay
          </Text>
        </Paper>
      )}

      <Group gap="lg" mt="xs">
        <Text size="xs" c="dimmed">
          Toplam{" "}
          <Text span fw={600} c="dark" style={{ fontVariantNumeric: "tabular-nums" }}>
            {total.toLocaleString("tr-TR")}
          </Text>
        </Text>
        <Text size="xs" c="dimmed">
          En yoğun gün{" "}
          <Text span fw={600} c="dark">
            {formatDay(peak.day)}
          </Text>{" "}
          <Text span style={{ fontVariantNumeric: "tabular-nums" }}>
            ({peak.count.toLocaleString("tr-TR")})
          </Text>
        </Text>
      </Group>
    </div>
  );
}

/** Kategoriye göre sıralı yatay çubuklar — büyüklük karşılaştırması. */
export function RankedBars({
  items,
  emptyLabel = "Veri yok.",
}: {
  items: { label: string; value: number }[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyLabel}
      </Text>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Stack gap={10}>
      {items.map((it) => {
        const pct = Math.max(2, Math.round((it.value / max) * 100));
        return (
          <div key={it.label}>
            <Group justify="space-between" wrap="nowrap" gap="sm" mb={3}>
              <Text size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                {it.label}
              </Text>
              <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                {it.value.toLocaleString("tr-TR")}
              </Text>
            </Group>
            <Box
              style={{
                height: 6,
                borderRadius: 4,
                background: "var(--mantine-color-gray-2)",
                overflow: "hidden",
              }}
            >
              <Box style={{ width: `${pct}%`, height: "100%", background: ACCENT, borderRadius: 4 }} />
            </Box>
          </div>
        );
      })}
    </Stack>
  );
}
