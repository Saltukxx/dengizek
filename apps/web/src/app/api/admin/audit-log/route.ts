// ---------------------------------------------------------------------------
// GET /api/admin/audit-log — sayfalı denetim kaydı
// ?entityType=&sayfa=
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { auditLogTable } from "@/lib/db/schema";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const pagination = parsePagination(url);

  const db = getDb();
  const where = entityType ? eq(auditLogTable.entityType, entityType) : undefined;

  const countQuery = db.select({ value: count() }).from(auditLogTable);
  const dataQuery = db.select().from(auditLogTable);

  const [countRow] = where ? await countQuery.where(where) : await countQuery;
  const totalCount = Number(countRow?.value ?? 0);

  const entries = where
    ? await dataQuery
        .where(where)
        .orderBy(desc(auditLogTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset)
    : await dataQuery
        .orderBy(desc(auditLogTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset);

  const result = paginatedMeta(entries, { ...pagination, totalCount });

  return NextResponse.json({
    ok: true,
    entries: result.items,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}
