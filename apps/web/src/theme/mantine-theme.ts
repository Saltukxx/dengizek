import { createTheme, rem } from "@mantine/core";

const brand = [
  "#fff7d6",
  "#f8e9a7",
  "#efd870",
  "#e6c364",
  "#d4af37",
  "#bd9826",
  "#92731a",
  "#6d5414",
  "#49380e",
  "#271e08",
] as const;

export const appTheme = createTheme({
  fontFamily: "var(--font-plus-jakarta), var(--font-inter), system-ui, sans-serif",
  primaryColor: "brand",
  primaryShade: 4,
  defaultRadius: "xs",
  colors: { brand: [...brand] },
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(16),
    lg: rem(18),
    xl: rem(20),
  },
  lineHeights: {
    md: "1.55",
  },
  shadows: {
    sm: "none",
    md: "none",
    xl: "none",
  },
  headings: {
    fontFamily: "var(--font-noto-serif), Georgia, serif",
    fontWeight: "400",
    sizes: {
      h1: { fontSize: rem(40), lineHeight: "1.2", fontWeight: "500" },
      h2: { fontSize: rem(32), lineHeight: "1.25", fontWeight: "500" },
      h3: { fontSize: rem(26), lineHeight: "1.3", fontWeight: "500" },
      h4: { fontSize: rem(20), lineHeight: "1.35", fontWeight: "500" },
      h5: { fontSize: rem(18), lineHeight: "1.4", fontWeight: "500" },
      h6: { fontSize: rem(16), lineHeight: "1.45", fontWeight: "600" },
    },
  },
  defaultGradient: { from: "brand.2", to: "brand.7", deg: 135 },
  components: {
    Button: {
      defaultProps: { size: "md" },
    },
    TextInput: { defaultProps: { size: "md" } },
    Textarea: { defaultProps: { size: "md" } },
    Card: {
      defaultProps: { shadow: "sm", withBorder: true, radius: "md" },
    },
    Paper: {
      defaultProps: { radius: "md" },
    },
  },
});
