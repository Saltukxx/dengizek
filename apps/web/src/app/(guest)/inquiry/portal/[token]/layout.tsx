// ---------------------------------------------------------------------------
// Talep portalı — misafirin token'lı mesajlaşma ve yorum ekranı.
//
// Portal istemcisi Mantine bileşenleri (Paper, Rating, notifications…)
// kullanıyor; (guest) ağacının geri kalanı ise Mantine'siz. Sağlayıcı ve stil
// dosyaları olmadan sayfa SSR'da "MantineProvider was not found" ile 500
// veriyordu. Kapsam bu rotayla sınırlı tutulur: diğer misafir sayfaları
// Mantine paketini indirmemeye devam eder.
// ---------------------------------------------------------------------------

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProviders } from "@/components/mantine-providers";

export default function InquiryPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MantineProviders>{children}</MantineProviders>;
}
