// ---------------------------------------------------------------------------
// GET/PATCH /api/tour/session — anonim misafirin "görülen adımlar" hafızası
// Kimlik doğrulama YOK — sessionToken client-üretilen opak bir UUID
// (localStorage). Düşük hassasiyetli, isteğe bağlı bir UX iyileştirmesi;
// DB yoksa veya hata olursa sessizce no-op döner, tur akışını asla kırmaz.
// ---------------------------------------------------------------------------

import { and, eq, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { guestSessionsTable } from "@/lib/db/schema";
import { guestSessionUpsertSchema } from "@/lib/schemas/guest-session";
import { apiFail, apiOk, apiRateLimited } from "@/lib/api-response";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  if (
    !(await checkRateLimit(requestIp(req), { name: "guest-session-read", windowMs: 60_000, limit: 60 }))
  ) {
    return apiRateLimited();
  }

  const url = new URL(req.url);
  const sessionToken = url.searchParams.get("token");
  const hotelSlug = url.searchParams.get("hotelSlug");
  const tourId = url.searchParams.get("tourId");
  if (!sessionToken || !hotelSlug || !tourId) {
    return apiFail("token, hotelSlug ve tourId gerekli.", 400);
  }

  if (!isDbConfigured()) return apiOk({ found: false });

  try {
    const db = getDb();
    const [row] = await db
      .select({ stepsSeen: guestSessionsTable.stepsSeen, lastStepId: guestSessionsTable.lastStepId })
      .from(guestSessionsTable)
      .where(
        and(
          eq(guestSessionsTable.sessionToken, sessionToken),
          eq(guestSessionsTable.hotelSlug, hotelSlug),
          eq(guestSessionsTable.tourId, tourId),
        ),
      )
      .limit(1);

    if (!row) return apiOk({ found: false });
    return apiOk({ found: true, stepsSeen: row.stepsSeen, lastStepId: row.lastStepId });
  } catch (err) {
    console.warn("[tour/session] GET başarısız:", err);
    return apiOk({ found: false });
  }
}

export async function PATCH(req: Request) {
  if (
    !(await checkRateLimit(requestIp(req), { name: "guest-session-write", windowMs: 60_000, limit: 60 }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = guestSessionUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  if (!isDbConfigured()) return apiOk({});

  try {
    const db = getDb();
    const { sessionToken, hotelSlug, tourId, stepsSeen, lastStepId } = parsed.data;
    await db
      .insert(guestSessionsTable)
      .values({ sessionToken, hotelSlug, tourId, stepsSeen, lastStepId: lastStepId ?? null })
      .onConflictDoUpdate({
        target: [
          guestSessionsTable.sessionToken,
          guestSessionsTable.hotelSlug,
          guestSessionsTable.tourId,
        ],
        set: { stepsSeen, lastStepId: lastStepId ?? null, updatedAt: sql`now()` },
      });
    return apiOk({});
  } catch (err) {
    console.warn("[tour/session] PATCH başarısız:", err);
    return apiOk({}); // misafir UX'ini kırma — sessizce yut
  }
}
