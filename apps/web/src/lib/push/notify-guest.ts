// ---------------------------------------------------------------------------
// Yönetici talebe cevap yazınca misafirin iOS cihazına bildirim.
// E-postanın yanında çalışır; başarısızlık cevabı engellemez (asla fırlatmaz).
// Bildirimde mesaj metni yok: kilit ekranında kişisel içerik görünmesin.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { hotelsTable, inquiryPushTargetsTable } from "@/lib/db/schema";
import { apnsConfigFromEnv, sendApns, type ApnsEnvironment } from "./apns";

type Db = ReturnType<typeof getDb>;

export async function notifyGuestReply(
  db: Db,
  inquiry: { id: string; hotelId: string | null },
  portalUrl: string,
): Promise<{ sent: number; removed: number }> {
  const config = apnsConfigFromEnv();
  if (!config) return { sent: 0, removed: 0 };
  try {
    const targets = await db
      .select()
      .from(inquiryPushTargetsTable)
      .where(eq(inquiryPushTargetsTable.inquiryId, inquiry.id));
    if (targets.length === 0) return { sent: 0, removed: 0 };
    const [hotel] = inquiry.hotelId
      ? await db.select({ name: hotelsTable.name }).from(hotelsTable).where(eq(hotelsTable.id, inquiry.hotelId)).limit(1)
      : [];
    const hotelName = hotel?.name;
    let sent = 0;
    let removed = 0;
    for (const target of targets) {
      const result = await sendApns(config, target.deviceToken, target.environment as ApnsEnvironment, {
        title: "Talebinize cevap geldi",
        body: hotelName ? `${hotelName} talebinizle ilgili yeni bir mesajınız var.` : "Talebinizle ilgili yeni bir mesajınız var.",
        data: { portalUrl, inquiryId: inquiry.id },
      });
      if (result.ok) sent += 1;
      else if (result.unregistered) {
        await db.delete(inquiryPushTargetsTable).where(eq(inquiryPushTargetsTable.id, target.id));
        removed += 1;
      } else {
        console.warn("[push] APNs gönderilemedi", { status: result.status, reason: result.reason });
      }
    }
    return { sent, removed };
  } catch (err) {
    console.warn("[push] misafir bildirimi atlandı:", err);
    return { sent: 0, removed: 0 };
  }
}
