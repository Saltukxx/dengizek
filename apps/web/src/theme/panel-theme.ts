// ---------------------------------------------------------------------------
// Panel teması — otel yöneticisi ve admin panelleri için
// Misafir sitesinin "lüks" temasından (altın + serif + koyu) bilinçli olarak
// ayrılır: aydınlık, yüksek kontrast, sans-serif, işlev odaklı.
// ---------------------------------------------------------------------------

import { DEFAULT_THEME, createTheme, rem, type MantineColorsTuple } from "@mantine/core";

// Mantine'in hazır renklerinde 6. ton (düğme, rozet, bağlantı yazısı) beyaz
// zeminde WCAG AA'nın (4.5:1) altında kalıyor: indigo ~4.0, kırmızı ~3.3,
// teal üstünde beyaz yazı ~2.5. Panelde kullanılan renklerin 6. ve 7.
// (hover) tonları koyulaştırılır. Ölçüt en kötü zemin: tablo satırı hover
// grisi (#f1f3f5) üstünde light varyantın renkli zemini; orada da ≥5:1.
// Diğer tonlar Mantine'inkiyle aynı.
const accessibleShades: Record<string, [string, string]> = {
  indigo: ["#364fc7", "#2f44ad"],
  blue: ["#1957ab", "#154a93"],
  teal: ["#08654c", "#06523e"],
  green: ["#1f6430", "#185126"],
  red: ["#a51d1d", "#8a1818"],
  orange: ["#9c330a", "#822a08"],
  yellow: ["#7a5000", "#634100"],
  violet: ["#5b37c8", "#4c2daa"],
  grape: ["#8a2fa0", "#732786"],
  cyan: ["#0a6475", "#085361"],
};

function withAccessibleShades(name: string): MantineColorsTuple {
  const tuple = [...DEFAULT_THEME.colors[name]];
  [tuple[6], tuple[7]] = accessibleShades[name];
  return tuple as unknown as MantineColorsTuple;
}

const accessibleColors = Object.fromEntries(
  Object.keys(accessibleShades).map((name) => [name, withAccessibleShades(name)]),
);

// Sakin, profesyonel indigo — durum renkleriyle (yeşil/sarı/kırmızı) çakışmaz
const panelBrand = [
  "#eef2ff",
  "#e0e7ff",
  "#c7d2fe",
  "#a5b4fc",
  "#818cf8",
  "#6366f1",
  "#4f46e5",
  "#4338ca",
  "#3730a3",
  "#312e81",
] as const;

const accessibleGray = [
  "#f8f9fa",
  "#f1f3f5",
  "#e9ecef",
  "#dee2e6",
  "#ced4da",
  "#8b9096",
  "#5f6368",
  "#474b50",
  "#343a40",
  "#212529",
] as const;

export const panelTheme = createTheme({
  fontFamily: "var(--font-inter), var(--font-plus-jakarta), system-ui, sans-serif",
  primaryColor: "indigo",
  primaryShade: 6,
  defaultRadius: "md",
  colors: { ...accessibleColors, brand: [...panelBrand], gray: [...accessibleGray] },
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(15),
    lg: rem(17),
    xl: rem(19),
  },
  headings: {
    // Panelde serif YOK — okunabilirlik önce gelir
    fontFamily: "var(--font-inter), var(--font-plus-jakarta), system-ui, sans-serif",
    fontWeight: "650",
    sizes: {
      h1: { fontSize: rem(30), lineHeight: "1.25" },
      h2: { fontSize: rem(24), lineHeight: "1.3" },
      h3: { fontSize: rem(20), lineHeight: "1.35" },
      h4: { fontSize: rem(17), lineHeight: "1.4" },
      h5: { fontSize: rem(15), lineHeight: "1.45" },
      h6: { fontSize: rem(14), lineHeight: "1.5" },
    },
  },
  shadows: {
    xs: "0 1px 2px rgba(16, 24, 40, 0.04)",
    sm: "0 1px 3px rgba(16, 24, 40, 0.07), 0 1px 2px rgba(16, 24, 40, 0.05)",
    md: "0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.05)",
  },
  components: {
    Button: { defaultProps: { size: "sm", radius: "md" } },
    TextInput: { defaultProps: { size: "sm" } },
    Textarea: { defaultProps: { size: "sm" } },
    NumberInput: { defaultProps: { size: "sm" } },
    Select: { defaultProps: { size: "sm" } },
    TagsInput: { defaultProps: { size: "sm" } },
    PasswordInput: { defaultProps: { size: "sm" } },
    Paper: { defaultProps: { radius: "md", shadow: "xs" } },
    Table: { defaultProps: { verticalSpacing: "sm", horizontalSpacing: "md" } },
    Badge: { defaultProps: { variant: "light", radius: "sm" } },
  },
});
