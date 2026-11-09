// ---------------------------------------------------------------------------
// GET/POST /api/manager/inquiries/[id]/messages — talep mesaj thread'i
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { validationMessage } from "@/lib/api-response";
import { and, asc, eq, or } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { inquiryMessageSchema } from "@/lib/schemas/hotel-panel";
import { notifyAdmins } from "@/lib/notifications";
import { inquiryForManager, messageForDisplay } from "@/lib/manager-privacy";

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

  // Moderasyon: tesis onaylanmamış talebi hiç göremez.
  if (inquiry.approvalStatus !== "onaylandi") {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  // Tesis: onaylanmış mesajları (her iki taraftan) + kendi gönderdiği
  // mesajları (onay bekleyen/reddedilen dahil, etiketle gösterilir) görür.
  // Misafirin onaylanmamış mesajları tesise gösterilmez.
  const messages = await db
    .select()
    .from(inquiryMessagesTable)
    .where(
      and(
        eq(inquiryMessagesTable.inquiryId, id),
        or(
          eq(inquiryMessagesTable.approvalStatus, "onaylandi"),
          eq(inquiryMessagesTable.senderRole, "hotel"),
        ),
      ),
    )
    .orderBy(asc(inquiryMessagesTable.createdAt));

  return NextResponse.json({
    ok: true,
    messages: messages.map(messageForDisplay),
    inquiry: inquiryForManager(inquiry),
  });
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

  // Onaylanmamış talebe yanıt yazılamaz.
  if (inquiry.approvalStatus !== "onaylandi") {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: validationMessage(parsed.error), issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  // Moderasyon: yanıt "bekliyor" kaydedilir. Misafire e-posta + portal linki,
  // admin onaylayınca gönderilir (bkz. /api/admin/moderation). Tesis kendi
  // mesajını "onay bekliyor" etiketiyle görür.
  const [message] = await db
    .insert(inquiryMessagesTable)
    .values({
      inquiryId: id,
      senderRole: "hotel",
      senderName: parsed.data.senderName ?? guard.user.name,
      body: parsed.data.body,
      approvalStatus: "bekliyor",
    })
    .returning();

  void notifyAdmins({
    type: "moderasyon",
    title: "Otel yanıtı onay bekliyor",
    body: parsed.data.body.slice(0, 80),
    link: "/admin/mesaj-onay",
  });

  return NextResponse.json({ ok: true, message: messageForDisplay(message) }, { status: 201 });
}
