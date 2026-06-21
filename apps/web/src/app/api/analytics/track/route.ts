import { eq } from "drizzle-orm";
import { trackEvent } from "@/lib/analytics";
import { apiFail, apiOk, apiRateLimited, apiServiceUnavailable } from "@/lib/api-response";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { analyticsTrackSchema } from "@/lib/schemas/analytics";

export async function POST(req: Request) {
  if (
    !(await checkRateLimit(requestIp(req), {
      name: "analytics",
      windowMs: 60_000,
      limit: 60,
    }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = analyticsTrackSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  if (!isDbConfigured()) {
    return apiServiceUnavailable("Analitik kaydı yapılandırılmamış.");
  }

  let hotelId: string | null = null;
  const hotelSlug = parsed.data.hotelSlug;
  if (hotelSlug) {
    const db = getDb();
    const [h] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(eq(hotelsTable.slug, hotelSlug))
      .limit(1);
    hotelId = h?.id ?? null;
  }

  await trackEvent(parsed.data.eventType, parsed.data.payload ?? {}, hotelId, hotelSlug);
  return apiOk({});
}
