// ---------------------------------------------------------------------------
// Talep moderasyonu — admin onay/red işlemlerinin yan etkileri.
//
// Misafir ile tesis arasındaki her mesaj (ilk talep dahil) önce "bekliyor"
// kaydedilir. Admin onaylayınca karşı tarafa TESLİM edilir:
//   • ilk talep onaylanınca → tesise "Yeni talep" bildirimi
//   • misafir mesajı onaylanınca → tesise "Misafirden yeni mesaj" bildirimi
//   • otel yanıtı onaylanınca → misafire e-posta + yeni portal linki
// Reddedilen içerik karşı tarafa hiç gösterilmez.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { notifyHotelMembers } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { notifyGuestReply } from "@/lib/push/notify-guest";
import { rotateInquiryPortalToken } from "@/lib/inquiry-portal-token";

type Db = ReturnType<typeof getDb>;
type Inquiry = typeof inquiriesTable.$inferSelect;
type Message = typeof inquiryMessagesTable.$inferSelect;

/** İlk talebi (misafirin ilk mesajı) onaylar → tesis artık görür. */
export async function approveInquiry(db: Db, inquiryId: string, adminId: string): Promise<Inquiry | null> {
  const [updated] = await db
    .update(inquiriesTable)
    .set({ approvalStatus: "onaylandi", approvedBy: adminId, approvedAt: new Date(), rejectedReason: null })
    .where(eq(inquiriesTable.id, inquiryId))
    .returning();
  if (!updated) return null;

  if (updated.hotelId) {
    await notifyHotelMembers(updated.hotelId, {
      type: "talep",
      title: "Yeni talep",
      body: `${updated.name} — ${updated.message.slice(0, 80)}`,
      link: "/dashboard/inquiries",
    });
  }
  return updated;
}

/** İlk talebi reddeder → tesise hiç gösterilmez. */
export async function rejectInquiry(
  db: Db,
  inquiryId: string,
  adminId: string,
  reason?: string,
): Promise<Inquiry | null> {
  const [updated] = await db
    .update(inquiriesTable)
    .set({ approvalStatus: "reddedildi", approvedBy: adminId, approvedAt: new Date(), rejectedReason: reason ?? null })
    .where(eq(inquiriesTable.id, inquiryId))
    .returning();
  return updated ?? null;
}

/** Thread mesajını onaylar ve karşı tarafa teslim eder. */
export async function approveMessage(db: Db, messageId: string, adminId: string): Promise<Message | null> {
  const [message] = await db
    .select()
    .from(inquiryMessagesTable)
    .where(eq(inquiryMessagesTable.id, messageId))
    .limit(1);
  if (!message) return null;

  const [updated] = await db
    .update(inquiryMessagesTable)
    .set({ approvalStatus: "onaylandi", approvedBy: adminId, approvedAt: new Date(), rejectedReason: null })
    .where(eq(inquiryMessagesTable.id, messageId))
    .returning();
  if (!updated) return null;

  const [inquiry] = await db
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.id, updated.inquiryId))
    .limit(1);
  if (!inquiry) return updated;

  if (updated.senderRole === "guest") {
    // Misafir mesajı → tesise bildir (yalnız talebin kendisi onaylıysa görünür).
    if (inquiry.hotelId && inquiry.approvalStatus === "onaylandi") {
      await notifyHotelMembers(inquiry.hotelId, {
        type: "mesaj",
        title: "Misafirden yeni mesaj",
        body: updated.body.slice(0, 80),
        link: "/dashboard/inquiries",
      });
    }
  } else if (updated.senderRole === "hotel") {
    // Otel yanıtı → misafire e-posta + yeni portal linki.
    const token = await rotateInquiryPortalToken(db, inquiry.id);
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/inquiry/portal/${token}`;
    await sendEmail({
      to: inquiry.email,
      subject: "Otelsayfam ekibinden yeni mesaj",
      text: `Merhaba ${inquiry.name},\n\nOtelsayfam ekibinden yeni bir mesaj var:\n\n${updated.body}\n\nYanıtlamak için: ${portalUrl}`,
    });
    await notifyGuestReply(db, inquiry, portalUrl);
  }

  return updated;
}

/** Thread mesajını reddeder → karşı tarafa hiç gösterilmez. */
export async function rejectMessage(
  db: Db,
  messageId: string,
  adminId: string,
  reason?: string,
): Promise<Message | null> {
  const [updated] = await db
    .update(inquiryMessagesTable)
    .set({ approvalStatus: "reddedildi", approvedBy: adminId, approvedAt: new Date(), rejectedReason: reason ?? null })
    .where(eq(inquiryMessagesTable.id, messageId))
    .returning();
  return updated ?? null;
}
