// ---------------------------------------------------------------------------
// GET/POST /api/inquiry/portal/[token]/messages — misafir mesaj portalı
// ---------------------------------------------------------------------------

import { asc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { inquiryMessageSchema } from "@/lib/schemas/hotel-panel";
import { notifyHotelMembers } from "@/lib/notifications";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiRateLimited, apiServiceUnavailable, apiFail, apiNotFound, apiOk } from "@/lib/api-response";

type RouteParams = { params: Promise<{ token: string }> };

async function findByToken(token: string) {
  const db = getDb();
  const [inquiry] = await db
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.accessToken, token))
    .limit(1);
  return inquiry;
}

export async function GET(_req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry) {
    return apiNotFound("Geçersiz bağlantı.");
  }

  const db = getDb();
  const messages = await db
    .select()
    .from(inquiryMessagesTable)
    .where(eq(inquiryMessagesTable.inquiryId, inquiry.id))
    .orderBy(asc(inquiryMessagesTable.createdAt));

  return apiOk({
    inquiry: {
      id: inquiry.id,
      name: inquiry.name,
      status: inquiry.status,
      hotelSlug: inquiry.hotelSlug,
    },
    messages,
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry) {
    return apiNotFound("Geçersiz bağlantı.");
  }

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
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  const db = getDb();
  const [message] = await db
    .insert(inquiryMessagesTable)
    .values({
      inquiryId: inquiry.id,
      senderRole: "guest",
      senderName: inquiry.name,
      body: parsed.data.body,
    })
    .returning();

  if (inquiry.hotelId) {
    void notifyHotelMembers(inquiry.hotelId, {
      type: "mesaj",
      title: "Misafirden yeni mesaj",
      body: parsed.data.body.slice(0, 80),
      link: "/dashboard/inquiries",
    });
  }

  return apiOk({ message }, 201);
}
