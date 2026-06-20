// ---------------------------------------------------------------------------
// GET/POST /api/manager/inquiries/[id]/messages — talep mesaj thread'i
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { inquiryMessageSchema } from "@/lib/schemas/hotel-panel";
import { sendEmail } from "@/lib/email";

type RouteParams = { params: Promise<{ id: string }> };

async function findInquiry(id: string) {
  const db = getDb();
  const [inquiry] = await db.select().from(inquiriesTable).where(eq(inquiriesTable.id, id)).limit(1);
  return inquiry;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const inquiry = await findInquiry(id);
  if (!inquiry) {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }
  if (!inquiry.hotelId) {
    return NextResponse.json({ ok: false, error: "Talep bir tesise bağlı değil." }, { status: 400 });
  }

  const guard = await requireHotelAccess(inquiry.hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const messages = await db
    .select()
    .from(inquiryMessagesTable)
    .where(eq(inquiryMessagesTable.inquiryId, id))
    .orderBy(asc(inquiryMessagesTable.createdAt));

  return NextResponse.json({ ok: true, messages, inquiry });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const inquiry = await findInquiry(id);
  if (!inquiry) {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }
  if (!inquiry.hotelId) {
    return NextResponse.json({ ok: false, error: "Talep bir tesise bağlı değil." }, { status: 400 });
  }

  const guard = await requireHotelAccess(inquiry.hotelId);
  if (guard.response) return guard.response;

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
      inquiryId: id,
      senderRole: "hotel",
      senderName: parsed.data.senderName ?? guard.user.name,
      body: parsed.data.body,
    })
    .returning();

  if (inquiry.accessToken) {
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/inquiry/portal/${inquiry.accessToken}`;
    void sendEmail({
      to: inquiry.email,
      subject: "Tesisinizden yeni mesaj — Dengizek",
      text: `Merhaba ${inquiry.name},\n\nTesisinizden yeni bir mesaj var:\n\n${parsed.data.body}\n\nYanıtlamak için: ${portalUrl}`,
    });
  }

  return NextResponse.json({ ok: true, message }, { status: 201 });
}
