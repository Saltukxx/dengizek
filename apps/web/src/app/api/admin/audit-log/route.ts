// ---------------------------------------------------------------------------
// GET /api/admin/audit-log — sayfalı denetim kaydı
// ?entityType=&sayfa=
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { auditLogTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const db = getDb();
  const base = db.select().from(auditLogTable);

  const entries = await (entityType
    ? base.where(eq(auditLogTable.entityType, entityType))
    : base)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  return NextResponse.json({ ok: true, entries, sayfa });
}
