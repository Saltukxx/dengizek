import type { Metadata } from "next";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { EB_Garamond, Hanken_Grotesk, Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";
import "./globals.css";

// Elite Reserve tipografisi: başlıklar Manrope, gövde Plus Jakarta Sans.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: true,
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: true,
});

// Inter yalnız panelde; misafir sayfalarında önceden yüklenmez.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
});

// Alpine Nocturne: kış yüzeyinde editoryal başlık + yüksek okunurluklu UI.
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Hanken yalnız kış yüzeyinin gövde yazısı; her sayfada önceden yüklenmez.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // Göreli paylaşım görselleri (/uploads/..., /marketing/...) bu adrese göre tam URL olur.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "Otelsayfam", locale: "tr_TR" },
  title: {
    default: "Otelsayfam — Otel video turları",
    template: "%s | Otelsayfam",
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
    // Font değişkenleri <html> üzerinde tanımlanır: globals.css'teki :root
    // token'ları (--er-font-*) bunlara referans verir, dolayısıyla aynı
    // elemanda görünür olmaları gerekir.
    <html
      lang="tr"
      className={`${plusJakarta.variable} ${manrope.variable} ${inter.variable} ${ebGaramond.variable} ${hankenGrotesk.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        {/* Çerez tercihi önceden verildiyse bandı boyamadan önce gizle (bkz. ConsentBanner). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});if(c==="granted"||c==="denied")document.documentElement.setAttribute("data-consent",c)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
