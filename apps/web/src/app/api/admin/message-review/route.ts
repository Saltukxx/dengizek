// ---------------------------------------------------------------------------
// GET  /api/admin/message-review — onay bekleyen talepler ve mesajlar
// POST /api/admin/message-review — bir öğeyi onayla veya reddet
//
// Misafir ile tesis arasındaki her mesaj (ilk talep dahil) burada modere
// edilir. Yan etkiler (teslim, bildirim, e-posta) için bkz. inquiry-moderation.
// (Tur/otel yayın incelemesi ayrıdır: /admin/moderation + ilgili uçlar.)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, inquiriesTable, inquiryMessagesTable } from "@/lib/db/schema";
import { validationMessage } from "@/lib/api-response";
import {
  approveInquiry,
  approveMessage,
  rejectInquiry,
  rejectMessage,
} from "@/lib/inquiry-moderation";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const db = getDb();

  // Onay bekleyen ilk talepler (misafirin ilk mesajı).
  const pendingInquiries = await db
    .select({
      id: inquiriesTable.id,
      hotelId: inquiriesTable.hotelId,
      hotelName: hotelsTable.name,
      hotelSlug: inquiriesTable.hotelSlug,
      guestName: inquiriesTable.name,
      body: inquiriesTable.message,
      createdAt: inquiriesTable.createdAt,
    })
    .from(inquiriesTable)
    .leftJoin(hotelsTable, eq(inquiriesTable.hotelId, hotelsTable.id))
    .where(eq(inquiriesTable.approvalStatus, "bekliyor"))
    .orderBy(asc(inquiriesTable.createdAt));

  // Onay bekleyen thread mesajları (misafir ve otel yanıtları).
  const pendingMessages = await db
    .select({
      id: inquiryMessagesTable.id,
      inquiryId: inquiryMessagesTable.inquiryId,
      senderRole: inquiryMessagesTable.senderRole,
      senderName: inquiryMessagesTable.senderName,
      body: inquiryMessagesTable.body,
      createdAt: inquiryMessagesTable.createdAt,
      hotelId: inquiriesTable.hotelId,
      hotelName: hotelsTable.name,
      guestName: inquiriesTable.name,
    })
    .from(inquiryMessagesTable)
    .innerJoin(inquiriesTable, eq(inquiryMessagesTable.inquiryId, inquiriesTable.id))
    .leftJoin(hotelsTable, eq(inquiriesTable.hotelId, hotelsTable.id))
    .where(eq(inquiryMessagesTable.approvalStatus, "bekliyor"))
    .orderBy(desc(inquiryMessagesTable.createdAt));

  const items = [
    ...pendingInquiries.map((i) => ({
      kind: "inquiry" as const,
      id: i.id,
      hotelName: i.hotelName ?? "(tesis yok)",
      hotelSlug: i.hotelSlug,
      direction: "guest" as const,
      senderLabel: i.guestName,
      body: i.body,
      createdAt: i.createdAt,
    })),
    ...pendingMessages.map((m) => ({
      kind: "message" as const,
      id: m.id,
      hotelName: m.hotelName ?? "(tesis yok)",
      hotelSlug: null,
      direction: m.senderRole === "hotel" ? ("hotel" as const) : ("guest" as const),
      senderLabel: m.senderRole === "hotel" ? (m.senderName ?? "Tesis") : m.guestName,
      body: m.body,
      createdAt: m.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return NextResponse.json({ ok: true, items, count: items.length });
}

const actionSchema = z.object({
  kind: z.enum(["inquiry", "message"]),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: validationMessage(parsed.error), issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const { kind, id, action, reason } = parsed.data;
  const adminId = guard.user.id;

  let result;
  if (kind === "inquiry") {
    result =
      action === "approve"
        ? await approveInquiry(db, id, adminId)
        : await rejectInquiry(db, id, adminId, reason);
  } else {
    result =
      action === "approve"
        ? await approveMessage(db, id, adminId)
        : await rejectMessage(db, id, adminId, reason);
  }

  if (!result) {
    return NextResponse.json({ ok: false, error: "Öğe bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
