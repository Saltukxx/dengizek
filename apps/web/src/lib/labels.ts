// ---------------------------------------------------------------------------
// Durum etiketleri — DB enum değerleri ASCII'dir, kullanıcıya gösterilen
// Türkçe karşılıklar buradan okunur.
// ---------------------------------------------------------------------------

import type {
  BookingStatus,
  InquirySource,
  InquiryStatus,
  MediaStatus,
  MemberRole,
  ModerationStatus,
  PaymentStatus,
  PropertyType,
  ReviewStatus,
  UserRole,
} from "@/lib/db/schema";

export const moderationStatusLabels: Record<ModerationStatus, string> = {
  taslak:     "Taslak",
  incelemede: "İncelemede",
  yayinda:    "Yayında",
  reddedildi: "Reddedildi",
};

/** Mantine Badge için durum rengi */
export const moderationStatusColors: Record<ModerationStatus, string> = {
  taslak:     "gray",
  incelemede: "yellow",
  yayinda:    "green",
  reddedildi: "red",
};

export const mediaStatusLabels: Record<MediaStatus, string> = {
  yuklendi:   "Yüklendi",
  isleniyor:  "İşleniyor",
  hazir:      "Hazır",
  hata:       "Hata",
  yayinlandi: "Yayınlandı",
};

export const mediaStatusColors: Record<MediaStatus, string> = {
  yuklendi:   "blue",
  isleniyor:  "yellow",
  hazir:      "teal",
  hata:       "red",
  yayinlandi: "green",
};

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  yeni:          "Yeni",
  ilgileniliyor: "İlgileniliyor",
  kapatildi:     "Kapatıldı",
};

export const inquiryStatusColors: Record<InquiryStatus, string> = {
  yeni:          "blue",
  ilgileniliyor: "yellow",
  kapatildi:     "gray",
};

export const userRoleLabels: Record<UserRole, string> = {
  admin:   "Platform Yöneticisi",
  manager: "Otel Yöneticisi",
};

export const memberRoleLabels: Record<MemberRole, string> = {
  owner:  "Sahip",
  editor: "Düzenleyici",
};

export const inquirySourceLabels: Record<InquirySource, string> = {
  web:         "Web formu",
  tour_ai:     "AI rehber",
  tour_player: "Tur oynatıcı",
};

export const propertyTypeLabels: Record<PropertyType, string> = {
  otel:     "Otel",
  apart:    "Apart",
  villa:    "Villa",
  butik:    "Butik otel",
  pansiyon: "Pansiyon",
  diger:    "Diğer",
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  beklemede:  "Beklemede",
  yayinda:    "Yayında",
  reddedildi: "Reddedildi",
};

export const bookingStatusLabels: Record<BookingStatus, string> = {
  beklemede:  "Beklemede",
  onaylandi:  "Onaylandı",
  iptal:      "İptal",
  no_show:    "Gelmedi",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  beklemede:   "Beklemede",
  odendi:      "Ödendi",
  iade:        "İade",
  basarisiz:   "Başarısız",
};
