import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.eventType) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let hotelId: string | null = null;
  const hotelSlug = body.hotelSlug as string | undefined;
  if (hotelSlug && isDbConfigured()) {
    const db = getDb();
    const [h] = await db.select({ id: hotelsTable.id }).from(hotelsTable).where(eq(hotelsTable.slug, hotelSlug)).limit(1);
    hotelId = h?.id ?? null;
  }

  await trackEvent(body.eventType, body.payload ?? {}, hotelId, hotelSlug);
  return NextResponse.json({ ok: true });
}
