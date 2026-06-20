// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/finance — ödeme kayıtları
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { paymentsTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.hotelId, guard.hotel.id))
    .orderBy(desc(paymentsTable.createdAt));

  const totalMinor = payments
    .filter((p) => p.status === "odendi")
    .reduce((sum, p) => sum + p.amountMinor, 0);

  return NextResponse.json({ ok: true, payments, totalMinor });
}
