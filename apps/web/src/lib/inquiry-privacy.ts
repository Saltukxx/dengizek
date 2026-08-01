// ---------------------------------------------------------------------------
// Misafir kişisel verisi — dışa aktarma ve anonimleştirme (GDPR / KVKK).
//
// TASARIM KARARI: "silme" tam DELETE değil, ANONİMLEŞTİRME olarak uygulanır.
// Otelin talebi/rezervasyonu ticari ve muhasebesel olarak tutması gerekebilir;
// kişiyi tanımlayan alanlar temizlenir, kayıt iskeleti kalır.
//
// ⚠️ Hangi verinin ne kadar tutulacağı HUKUKİ bir karardır. Buradaki kapsam
// bir varsayımdır ve tek fonksiyonda izole tutulmuştur ki gerekirse tek
// yerden değiştirilebilsin.
// ---------------------------------------------------------------------------

import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable, reviewsTable } from "@/lib/db/schema";

type DbLike = Db | Tx;

export const ANONYMIZED_NAME = "Silinmiş misafir";

export interface InquiryPersonalData {
  talep: {
    id: string;
    olusturulma: string;
    ad: string;
    eposta: string;
    telefon: string | null;
    mesaj: string;
    girisTarihi: string | null;
    cikisTarihi: string | null;
    yetiskin: number | null;
    cocuk: number | null;
    pazarlamaOnayi: boolean;
    durum: string;
  };
  mesajlar: { gonderen: string; ad: string | null; metin: string; tarih: string }[];
  yorumlar: { puan: number; baslik: string | null; metin: string; durum: string; tarih: string }[];
}

/** Talebe bağlı tüm kişisel veriyi okunur biçimde döner (veri taşınabilirliği). */
export async function exportInquiryPersonalData(
  db: DbLike,
  inquiry: typeof inquiriesTable.$inferSelect,
): Promise<InquiryPersonalData> {
  const [messages, reviews] = await Promise.all([
    db
      .select()
      .from(inquiryMessagesTable)
      .where(eq(inquiryMessagesTable.inquiryId, inquiry.id)),
    db.select().from(reviewsTable).where(eq(reviewsTable.inquiryId, inquiry.id)),
  ]);

  return {
    talep: {
      id: inquiry.id,
      olusturulma: inquiry.createdAt.toISOString(),
      ad: inquiry.name,
      eposta: inquiry.email,
      telefon: inquiry.phone,
      mesaj: inquiry.message,
      girisTarihi: inquiry.checkIn == null ? null : String(inquiry.checkIn),
      cikisTarihi: inquiry.checkOut == null ? null : String(inquiry.checkOut),
      yetiskin: inquiry.adults,
      cocuk: inquiry.children,
      pazarlamaOnayi: inquiry.marketingConsent,
      durum: inquiry.status,
    },
    mesajlar: messages.map((m) => ({
      gonderen: m.senderRole,
      ad: m.senderName,
      metin: m.body,
      tarih: m.createdAt.toISOString(),
    })),
    yorumlar: reviews.map((r) => ({
      puan: r.rating,
      baslik: r.title,
      metin: r.body,
      durum: r.status,
      tarih: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Kişiyi tanımlayan alanları temizler ve portal erişimini kapatır.
 * İdempotenttir — ikinci çağrı aynı sonucu verir.
 */
export async function anonymizeInquiry(db: DbLike, inquiryId: string): Promise<void> {
  await db
    .update(inquiriesTable)
    .set({
      name: ANONYMIZED_NAME,
      // E-posta NOT NULL + unique değil; tanımlayıcı olmayan sabit bir değer.
      email: "silinmis@dengizek.invalid",
      phone: null,
      message: "[Misafir talebi üzerine silindi]",
      marketingConsent: false,
      // Portal bağlantısı geçersiz kılınır — anonimleştirilmiş kayda erişim kalmasın.
      accessTokenHash: null,
      accessTokenRevokedAt: new Date(),
    })
    .where(eq(inquiriesTable.id, inquiryId));

  // Misafirin yazdığı mesaj gövdeleri silinir; otelin yanıtları ticari yazışma
  // olarak kalır ama gönderen adı temizlenir.
  await db
    .update(inquiryMessagesTable)
    .set({ body: "[silindi]", senderName: ANONYMIZED_NAME })
    .where(
      and(
        eq(inquiryMessagesTable.inquiryId, inquiryId),
        eq(inquiryMessagesTable.senderRole, "guest"),
      ),
    );

  // Yayındaki yorum içeriği kamuya açık ve otel için değerli — metin kalır,
  // yalnızca isim anonimleşir.
  await db
    .update(reviewsTable)
    .set({ guestName: ANONYMIZED_NAME })
    .where(eq(reviewsTable.inquiryId, inquiryId));
}
