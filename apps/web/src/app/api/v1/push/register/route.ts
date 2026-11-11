// ---------------------------------------------------------------------------
// POST /api/v1/push/register — iOS: "cevap gelince bildirim al".
//
// Misafirin hesabı yok; cihaz kimliği talebe bağlanır. Talep kimliği yalnız
// talebi gönderen uygulamaya döner (tahmin edilemez UUID). Bildirim metni
// kişisel içerik taşımaz, bu yüzden başka birinin kaydı bir şey sızdırmaz.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiFail, apiNotFound, apiOk, apiRateLimited, apiServiceUnavailable, validationMessage } from "@/lib/api-response";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable, inquiryPushTargetsTable } from "@/lib/db/schema";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

/** Bir talebe en fazla bu kadar cihaz bağlanabilir. */
const MAX_DEVICES_PER_INQUIRY = 5;

const pushRegisterSchema = z.object({
  inquiryId: z.string().uuid("Geçersiz talep."),
  deviceToken: z.string().regex(/^[0-9a-f]{64,200}$/i, "Geçersiz cihaz kimliği."),
  environment: z.enum(["sandbox", "production"]),
});

export async function POST(req: Request) {
  if (!isDbConfigured()) return apiServiceUnavailable("Bildirim kaydı yapılandırılmamış.");
  if (!(await checkRateLimit(requestIp(req), { name: "push-register", windowMs: 60_000, limit: 10 }))) {
    return apiRateLimited();
  }
  const parsed = pushRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiFail(validationMessage(parsed.error), 400);
  const { inquiryId, deviceToken, environment } = parsed.data;

  const db = getDb();
  const [inquiry] = await db.select({ id: inquiriesTable.id }).from(inquiriesTable).where(eq(inquiriesTable.id, inquiryId)).limit(1);
  if (!inquiry) return apiNotFound("Talep bulunamadı.");

  const existing = await db
    .select({ token: inquiryPushTargetsTable.deviceToken })
    .from(inquiryPushTargetsTable)
    .where(eq(inquiryPushTargetsTable.inquiryId, inquiryId));
  const token = deviceToken.toLowerCase();
  if (!existing.some((row) => row.token === token) && existing.length >= MAX_DEVICES_PER_INQUIRY) {
    return apiFail("Bu talep için bildirim alan cihaz sayısı doldu.", 409);
  }

  await db
    .insert(inquiryPushTargetsTable)
    .values({ inquiryId, deviceToken: token, environment })
    .onConflictDoNothing();
  return apiOk({});
}
