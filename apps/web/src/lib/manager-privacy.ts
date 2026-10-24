// ---------------------------------------------------------------------------
// Otel paneline giden misafir kayıtları.
//
// Tesis misafire yalnız Otelsayfam içindeki yazışmadan ulaşır; e-posta ve telefon
// panele hiç gönderilmez (arayüzde gizlemek yetmez — yanıtın kendisinde yok).
// Platform yöneticisi (admin uçları) tam kaydı görmeye devam eder.
// ---------------------------------------------------------------------------

import type { bookingsTable, inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { redactContactInfo, redactNullable } from "@/lib/contact-guard";

type Inquiry = typeof inquiriesTable.$inferSelect;
type Booking = typeof bookingsTable.$inferSelect;
type Message = typeof inquiryMessagesTable.$inferSelect;

export function inquiryForManager(row: Inquiry) {
  const rest: Partial<Inquiry> = { ...row };
  delete rest.email;
  delete rest.phone;
  delete rest.accessTokenHash;
  delete rest.accessTokenExpiresAt;
  delete rest.accessTokenRevokedAt;
  return {
    ...(rest as Omit<
      Inquiry,
      "email" | "phone" | "accessTokenHash" | "accessTokenExpiresAt" | "accessTokenRevokedAt"
    >),
    name: redactContactInfo(row.name),
    message: redactContactInfo(row.message),
  };
}

export function bookingForManager(row: Booking) {
  const rest: Partial<Booking> = { ...row };
  delete rest.guestEmail;
  delete rest.guestPhone;
  return {
    ...(rest as Omit<Booking, "guestEmail" | "guestPhone">),
    guestName: redactContactInfo(row.guestName),
  };
}

/** Kural gelmeden önce yazılmış eski mesajlar da okunurken maskelenir. */
export function messageForDisplay(row: Message) {
  return { ...row, body: redactContactInfo(row.body), senderName: redactNullable(row.senderName) };
}
