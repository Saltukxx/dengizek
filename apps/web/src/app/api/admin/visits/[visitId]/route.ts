// ---------------------------------------------------------------------------
// GET /api/admin/visits/[visitId] — tek ziyaretin zaman sıralı yolculuğu:
// otel sayfası, tur adımları, sorular ve cevaplar, çıkış, talep.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";
import { visitIdSchema } from "@/lib/schemas/analytics";
import { apiNotFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ visitId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { visitId } = await params;
  if (!visitIdSchema.safeParse(visitId).success) return apiNotFound("Ziyaret bulunamadı.");

  const events = await getDb()
    .select({
      id: analyticsEventsTable.id,
      eventType: analyticsEventsTable.eventType,
      hotelSlug: analyticsEventsTable.hotelSlug,
      payload: analyticsEventsTable.payload,
      createdAt: analyticsEventsTable.createdAt,
    })
    .from(analyticsEventsTable)
    .where(eq(analyticsEventsTable.visitId, visitId))
    .orderBy(asc(analyticsEventsTable.createdAt))
    .limit(500);

  if (events.length === 0) return apiNotFound("Ziyaret bulunamadı.");
  return NextResponse.json({ ok: true, visitId, events });
}
