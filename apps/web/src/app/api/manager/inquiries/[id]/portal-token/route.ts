import { eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable } from "@/lib/db/schema";
import { rotateInquiryPortalToken } from "@/lib/inquiry-portal-token";
import { apiFail, apiOk } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

async function authorizedInquiry(id: string) {
  const db = getDb();
  const [inquiry] = await db.select().from(inquiriesTable).where(eq(inquiriesTable.id, id)).limit(1);
  if (!inquiry?.hotelId) return { response: apiFail("Talep bulunamadı.", 404) };
  const guard = await requireHotelAccess(inquiry.hotelId);
  if (guard.response) return { response: guard.response };
  return { inquiry, db };
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await authorizedInquiry(id);
  if (result.response) return result.response;
  const token = await rotateInquiryPortalToken(result.db!, id);
  return apiOk({ token, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await authorizedInquiry(id);
  if (result.response) return result.response;
  await result.db!.update(inquiriesTable).set({ accessTokenRevokedAt: new Date() }).where(eq(inquiriesTable.id, id));
  return apiOk({ revoked: true });
}
