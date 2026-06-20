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

  return NextResponse.json({ ok: true, feeds: withExportUrls });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = icalFeedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [feed] = await db
    .insert(hotelIcalFeedsTable)
    .values({
      hotelId: guard.hotel.id,
      name: parsed.data.name,
      importUrl: parsed.data.importUrl ?? null,
      exportToken: randomBytes(16).toString("hex"),
    })
    .returning();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json(
    {
      ok: true,
      feed: { ...feed, exportUrl: `${baseUrl}/api/ical/export/${feed.exportToken}` },
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  const db = getDb();
  await db
    .delete(hotelIcalFeedsTable)
    .where(
      and(eq(hotelIcalFeedsTable.id, id), eq(hotelIcalFeedsTable.hotelId, guard.hotel.id)),
    );

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = icalFeedPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(hotelIcalFeedsTable)
    .set(fields)
    .where(
      and(eq(hotelIcalFeedsTable.id, id), eq(hotelIcalFeedsTable.hotelId, guard.hotel.id)),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Feed bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, feed: updated });
}
