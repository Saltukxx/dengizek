// ---------------------------------------------------------------------------
// GET/POST /api/inquiry/portal/[token]/messages — misafir mesaj portalı
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { inquiryMessageSchema } from "@/lib/schemas/hotel-panel";
import { notifyHotelMembers } from "@/lib/notifications";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

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
    return NextResponse.json({ ok: false, error: "Servis kullanılamıyor." }, { status: 503 });
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry) {
    return NextResponse.json({ ok: false, error: "Geçersiz bağlantı." }, { status: 404 });
  }

  const db = getDb();
  const messages = await db
    .select()
    .from(inquiryMessagesTable)
    .where(eq(inquiryMessagesTable.inquiryId, inquiry.id))
    .orderBy(asc(inquiryMessagesTable.createdAt));

  return NextResponse.json({
    ok: true,
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
    return NextResponse.json({ ok: false, error: "Servis kullanılamıyor." }, { status: 503 });
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry) {
    return NextResponse.json({ ok: false, error: "Geçersiz bağlantı." }, { status: 404 });
  }

  if (
    !checkRateLimit(`${token}:${requestIp(req)}`, {
      name: "portal-msg",
      windowMs: 60_000,
      limit: 10,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla mesaj gönderdiniz, lütfen biraz bekleyin." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
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

  return NextResponse.json({ ok: true, message }, { status: 201 });
}
