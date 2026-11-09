// ---------------------------------------------------------------------------
// GET/POST /api/inquiry/portal/[token]/messages — misafir mesaj portalı
// ---------------------------------------------------------------------------

import { and, asc, eq, or } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { inquiryMessageSchema } from "@/lib/schemas/hotel-panel";
import { notifyAdmins } from "@/lib/notifications";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiRateLimited, apiServiceUnavailable, apiFail, apiNotFound, apiOk, validationMessage } from "@/lib/api-response";
import { hashPortalToken } from "@/lib/inquiry-portal-token";
import { messageForDisplay } from "@/lib/manager-privacy";

type RouteParams = { params: Promise<{ token: string }> };

async function findByToken(token: string) {
  const db = getDb();
  const [inquiry] = await db
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.accessTokenHash, hashPortalToken(token)))
    .limit(1);
  return inquiry;
}

function tokenUnavailable(inquiry: typeof inquiriesTable.$inferSelect) {
  return Boolean(inquiry.accessTokenRevokedAt || !inquiry.accessTokenExpiresAt || inquiry.accessTokenExpiresAt.getTime() < Date.now());
}

export async function GET(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  // Token'lı herkese açık uç — brute-force taramasını yavaşlat.
  if (
    !(await checkRateLimit(`portal-get:${requestIp(req)}`, {
      name: "portal-get",
      windowMs: 60_000,
      limit: 60,
    }))
  ) {
    return apiRateLimited();
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry || tokenUnavailable(inquiry)) {
    return apiNotFound("Geçersiz bağlantı.");
  }

  const db = getDb();
  // Moderasyon: misafir kendi mesajlarını (onay bekleyen dahil) + yalnız
  // onaylanmış otel mesajlarını görür. Onaylanmamış otel yanıtı görünmez.
  const messages = await db
    .select()
    .from(inquiryMessagesTable)
    .where(
      and(
        eq(inquiryMessagesTable.inquiryId, inquiry.id),
        or(
          eq(inquiryMessagesTable.approvalStatus, "onaylandi"),
          eq(inquiryMessagesTable.senderRole, "guest"),
        ),
      ),
    )
    .orderBy(asc(inquiryMessagesTable.createdAt));

  return apiOk({
    inquiry: {
      id: inquiry.id,
      name: inquiry.name,
      status: inquiry.status,
      hotelSlug: inquiry.hotelSlug,
    },
    messages: messages.map(messageForDisplay),
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry || tokenUnavailable(inquiry)) {
    return apiNotFound("Geçersiz bağlantı.");
  }
  if (inquiry.status === "kapatildi") return apiFail("Talep kapatıldığı için portal salt okunurdur.", 409, { code: "PORTAL_READ_ONLY" });

  if (
    !(await checkRateLimit(`${token}:${requestIp(req)}`, {
      name: "portal-msg",
      windowMs: 60_000,
      limit: 10,
    }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryMessageSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail(validationMessage(parsed.error), 400, { issues: parsed.error.flatten() });
  }

  const db = getDb();
  // Moderasyon: misafir mesajı "bekliyor" kaydedilir, tesise doğrudan gitmez.
  // Admin onaylayınca tesise bildirim düşer (bkz. /api/admin/moderation).
  const [message] = await db
    .insert(inquiryMessagesTable)
    .values({
      inquiryId: inquiry.id,
      senderRole: "guest",
      senderName: inquiry.name,
      body: parsed.data.body,
      approvalStatus: "bekliyor",
    })
    .returning();

  void notifyAdmins({
    type: "moderasyon",
    title: "Misafir mesajı onay bekliyor",
    body: parsed.data.body.slice(0, 80),
    link: "/admin/mesaj-onay",
  });

  return apiOk({ message: messageForDisplay(message) }, 201);
}
