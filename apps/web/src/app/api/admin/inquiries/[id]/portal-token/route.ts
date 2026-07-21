import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable } from "@/lib/db/schema";
import { rotateInquiryPortalToken } from "@/lib/inquiry-portal-token";
import { apiFail, apiOk } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const { id } = await params;
  const db = getDb();
  const [inquiry] = await db.select({ id: inquiriesTable.id }).from(inquiriesTable).where(eq(inquiriesTable.id, id)).limit(1);
  if (!inquiry) return apiFail("Talep bulunamadı.", 404);
  const token = await rotateInquiryPortalToken(db, id);
  return apiOk({ token, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const { id } = await params;
  const [updated] = await getDb().update(inquiriesTable).set({ accessTokenRevokedAt: new Date() }).where(eq(inquiriesTable.id, id)).returning();
  if (!updated) return apiFail("Talep bulunamadı.", 404);
  return apiOk({ revoked: true });
}
