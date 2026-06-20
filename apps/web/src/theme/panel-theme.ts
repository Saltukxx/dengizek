// ---------------------------------------------------------------------------
// Panel teması — otel yöneticisi ve admin panelleri için
// Misafir sitesinin "lüks" temasından (altın + serif + koyu) bilinçli olarak
// ayrılır: aydınlık, yüksek kontrast, sans-serif, işlev odaklı.
// ---------------------------------------------------------------------------

import { createTheme, rem } from "@mantine/core";

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

export const panelTheme = createTheme({
  fontFamily: "var(--font-inter), var(--font-plus-jakarta), system-ui, sans-serif",
  primaryColor: "indigo",
  primaryShade: 6,
  defaultRadius: "md",
  colors: { brand: [...panelBrand] },
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
