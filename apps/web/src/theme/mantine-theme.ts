import { createTheme, rem } from "@mantine/core";

/** Deep Trust Blue (#1c56a6) çevresinde üretilen marka tonları. */
const brand = [
  "#eff4fc",
  "#d7e2ff",
  "#abc7ff",
  "#7ba5ef",
  "#4b81d6",
  "#2b66be",
  "#1c56a6", // primary
  "#154684",
  "#0f3363",
  "#0e1f40", // Midnight Navy
] as const;

/** Action Orange (#f26522) — yalnızca rezervasyon/CTA yüzeyleri. */
const accent = [
  "#fff2ec",
  "#ffdbce",
  "#ffb599",
  "#ff8f64",
  "#fc6c29",
  "#f26522",
  "#dd5511",
  "#b8440d",
  "#8f350a",
  "#5a1c00",
] as const;

export const appTheme = createTheme({
  fontFamily: "var(--font-plus-jakarta), var(--font-inter), system-ui, sans-serif",
  primaryColor: "brand",
  primaryShade: 6,
  defaultRadius: "sm",
  colors: { brand: [...brand], accent: [...accent] },
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(16),
    lg: rem(18),
    xl: rem(20),
  },
  lineHeights: {
    md: "1.6",
  },
  radius: {
    xs: rem(4),
    sm: rem(8),
    md: rem(12),
    lg: rem(16),
    xl: rem(24),
  },
  shadows: {
    xs: "0 1px 2px rgba(14, 31, 64, 0.06)",
    sm: "0 2px 8px rgba(14, 31, 64, 0.06)",
    md: "0 8px 32px rgba(14, 31, 64, 0.08)",
    lg: "0 12px 40px rgba(14, 31, 64, 0.10)",
    xl: "0 16px 48px rgba(14, 31, 64, 0.12)",
  },
  headings: {
    fontFamily: "var(--font-manrope), Manrope, system-ui, sans-serif",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: rem(48), lineHeight: "1.2", fontWeight: "700" },
      h2: { fontSize: rem(36), lineHeight: "1.2", fontWeight: "700" },
      h3: { fontSize: rem(24), lineHeight: "1.3", fontWeight: "600" },
      h4: { fontSize: rem(20), lineHeight: "1.35", fontWeight: "600" },
      h5: { fontSize: rem(18), lineHeight: "1.4", fontWeight: "600" },
      h6: { fontSize: rem(16), lineHeight: "1.45", fontWeight: "600" },
    },
  },
  defaultGradient: { from: "brand.6", to: "brand.9", deg: 135 },
  components: {
    Button: {
      defaultProps: { size: "md", radius: "sm" },
    },
    TextInput: { defaultProps: { size: "md", radius: "sm" } },
    Textarea: { defaultProps: { size: "md", radius: "sm" } },
    Card: {
      defaultProps: { shadow: "sm", withBorder: true, radius: "md" },
    },
    Paper: {
      defaultProps: { radius: "md" },
    },
  },
});
