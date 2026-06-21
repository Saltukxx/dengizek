// ---------------------------------------------------------------------------
// GET/PATCH /api/manager/notifications — panel bildirimleri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { userNotificationsTable } from "@/lib/db/schema";
import { notificationPatchSchema } from "@/lib/schemas/hotel-panel";
import { parsePagination, paginatedQuery } from "@/lib/pagination";

export async function GET(req: Request) {
  const guard = await requireUser();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("okunmamis") === "1";
  const pagination = parsePagination(url);

  const db = getDb();
  const filters = [eq(userNotificationsTable.userId, guard.user.id)];
  if (unreadOnly) {
    filters.push(isNull(userNotificationsTable.readAt));
  }

  const where = and(...filters);
  const result = await paginatedQuery({
    db,
    table: userNotificationsTable,
    where,
    orderBy: desc(userNotificationsTable.createdAt),
    pagination,
  });

  return NextResponse.json({
    ok: true,
    notifications: result.items,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

export async function PATCH(req: Request) {
  const guard = await requireUser();
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = notificationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  await db
    .update(userNotificationsTable)
    .set({ readAt: parsed.data.read ? new Date() : null })
    .where(
      and(
        eq(userNotificationsTable.userId, guard.user.id),
        inArray(userNotificationsTable.id, parsed.data.ids),
      ),
    );

  return NextResponse.json({ ok: true });
}
