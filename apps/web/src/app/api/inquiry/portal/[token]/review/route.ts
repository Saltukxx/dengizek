// ---------------------------------------------------------------------------
// GET/POST /api/inquiry/portal/[token]/review — misafirin yorum bırakması
//
// Kimlik doğrulama talep portal token'ıyla yapılır (messages route ile aynı
// desen). Otel ve misafir adı TALEP KAYDINDAN okunur, istemciden alınmaz —
// böylece bir misafir başka bir otele yorum yazamaz.
//
// Yorum "beklemede" başlar; mevcut moderasyon zinciri (admin/dashboard) onu
// yayına alır. Talep başına tek yorum yazılabilir.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable, reviewsTable } from "@/lib/db/schema";
import { guestReviewSchema } from "@/lib/schemas/hotel-panel";
import { notifyHotelMembers } from "@/lib/notifications";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { hashPortalToken } from "@/lib/inquiry-portal-token";
import {
  apiFail,
  apiNotFound,
  apiOk,
  apiRateLimited,
  apiServiceUnavailable,
} from "@/lib/api-response";

type RouteParams = { params: Promise<{ token: string }> };

async function findByToken(token: string) {
  const [inquiry] = await getDb()
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.accessTokenHash, hashPortalToken(token)))
    .limit(1);
  return inquiry;
}

function tokenUnavailable(inquiry: typeof inquiriesTable.$inferSelect) {
  return Boolean(
    inquiry.accessTokenRevokedAt ||
      !inquiry.accessTokenExpiresAt ||
      inquiry.accessTokenExpiresAt.getTime() < Date.now(),
  );
}

async function findExistingReview(inquiryId: string) {
  const [review] = await getDb()
    .select({
      id: reviewsTable.id,
      rating: reviewsTable.rating,
      title: reviewsTable.title,
      body: reviewsTable.body,
      status: reviewsTable.status,
      reply: reviewsTable.reply,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.inquiryId, inquiryId))
    .limit(1);
  return review;
}

export async function GET(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) return apiServiceUnavailable("Servis kullanılamıyor.");

  if (
    !(await checkRateLimit(requestIp(req), {
      name: "portal-review-get",
      windowMs: 60_000,
      limit: 60,
    }))
  ) {
    return apiRateLimited();
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry || tokenUnavailable(inquiry)) return apiNotFound("Geçersiz bağlantı.");

  const review = await findExistingReview(inquiry.id);
  return apiOk({ review: review ?? null, canReview: Boolean(inquiry.hotelId) });
}

export async function POST(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) return apiServiceUnavailable("Servis kullanılamıyor.");

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry || tokenUnavailable(inquiry)) return apiNotFound("Geçersiz bağlantı.");
  if (!inquiry.hotelId) {
    return apiFail("Bu talep bir tesise bağlı değil — yorum bırakılamaz.", 409);
  }

  // Token'lı herkese açık uç — yazma limiti okumadan daha sıkı.
  if (
    !(await checkRateLimit(`${token}:${requestIp(req)}`, {
      name: "portal-review",
      windowMs: 60_000,
      limit: 5,
    }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = guestReviewSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  if (await findExistingReview(inquiry.id)) {
    return apiFail("Bu talep için zaten yorum bıraktınız.", 409, { code: "REVIEW_EXISTS" });
  }

  const db = getDb();
  let review;
  try {
    [review] = await db
      .insert(reviewsTable)
      .values({
        hotelId: inquiry.hotelId,
        inquiryId: inquiry.id,
        rating: parsed.data.rating,
        title: parsed.data.title ?? null,
        body: parsed.data.body,
        // Ad ve konaklama tarihi talep kaydından — istemci değiştiremez.
        guestName: inquiry.name,
        stayDate: parsed.data.stayDate ?? inquiry.checkIn ?? null,
        source: "verified_guest",
        status: "beklemede",
      })
      .returning();
  } catch (err) {
    // inquiry_id unique index — eşzamanlı iki gönderimde ikincisi düşer.
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(message)) {
      return apiFail("Bu talep için zaten yorum bıraktınız.", 409, { code: "REVIEW_EXISTS" });
    }
    throw err;
  }

  await notifyHotelMembers(inquiry.hotelId, {
    type: "yorum",
    title: "Misafirden yeni yorum",
    body: `${parsed.data.rating}/5 — ${parsed.data.body.slice(0, 60)}`,
    link: "/dashboard/reviews",
  });

  return apiOk({ review }, 201);
}
