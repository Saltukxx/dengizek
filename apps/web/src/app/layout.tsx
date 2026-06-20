import type { Metadata } from "next";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Inter, Noto_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { AppProviders } from "@/components/providers";
import "./globals.css";

// Only load fonts actually used in the luxury theme
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: true,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dengizek — Otel video turları",
    template: "%s | Dengizek",
  },
  description:
    "Etkileşimli, adım adım video turlarla otelleri keşfedin ve yer ayırtmadan önce mekânlara göz atın.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
        {/* Material Symbols — mobile nav + tour player icons */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
        />
      </head>
      <body className={`${plusJakarta.variable} ${inter.variable} ${notoSerif.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
