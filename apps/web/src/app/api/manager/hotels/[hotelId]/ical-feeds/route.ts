// ---------------------------------------------------------------------------
// GET/POST/DELETE /api/manager/hotels/[hotelId]/ical-feeds
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelIcalFeedsTable } from "@/lib/db/schema";
import { icalFeedPatchSchema, icalFeedSchema } from "@/lib/schemas/hotel-panel";
import { assertRoomsBelongToHotel } from "@/lib/tenant-integrity";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const feeds = await db
    .select()
    .from(hotelIcalFeedsTable)
    .where(eq(hotelIcalFeedsTable.hotelId, guard.hotel.id))
    .orderBy(asc(hotelIcalFeedsTable.createdAt));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const withExportUrls = feeds.map((f) => ({
    ...f,
    exportUrl: f.exportToken ? `${baseUrl}/api/ical/export/${f.exportToken}` : null,
  }));

  const revision = await getPanelRevision(db, guard.hotel.id, "connectivity");
  return NextResponse.json({ ok: true, feeds: withExportUrls, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = icalFeedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  let feed: typeof hotelIcalFeedsTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "connectivity", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.insert(hotelIcalFeedsTable).values({
        hotelId: guard.hotel.id, name: parsed.data.name,
        importUrl: parsed.data.importUrl ?? null, roomId: parsed.data.roomId ?? null,
        exportToken: randomBytes(16).toString("hex"),
      }).returning(); return row; },
    });
    feed = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json(
    {
      ok: true,
      feed: { ...feed, exportUrl: `${baseUrl}/api/ical/export/${feed.exportToken}` },
      revision,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  try {
    const { revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "connectivity", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(hotelIcalFeedsTable).where(and(
        eq(hotelIcalFeedsTable.id, id), eq(hotelIcalFeedsTable.hotelId, guard.hotel.id),
      )); },
    });
    return NextResponse.json({ ok: true, revision });
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = icalFeedPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [fields.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  let updated: typeof hotelIcalFeedsTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "connectivity", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.update(hotelIcalFeedsTable).set(fields).where(and(
        eq(hotelIcalFeedsTable.id, id), eq(hotelIcalFeedsTable.hotelId, guard.hotel.id),
      )).returning(); if (!row) abortPanelMutation("Feed bulunamadı."); return row; },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Feed bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, feed: updated, revision });
}
