// ---------------------------------------------------------------------------
// GET  /api/inquiry/portal/[token]/data   — kişisel veriyi dışa aktar (GDPR)
// POST /api/inquiry/portal/[token]/data   — silme talebi (anonimleştirme)
//
// Kimlik doğrulama portal token'ıyla — messages/review route'larıyla aynı desen.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { inquiriesTable } from "@/lib/db/schema";
import { hashPortalToken } from "@/lib/inquiry-portal-token";
import { anonymizeInquiry, exportInquiryPersonalData } from "@/lib/inquiry-privacy";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { apiNotFound, apiOk, apiRateLimited, apiServiceUnavailable } from "@/lib/api-response";

type RouteParams = { params: Promise<{ token: string }> };

async function findByToken(token: string) {
  const [inquiry] = await getDb()
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.accessTokenHash, hashPortalToken(token)))
    .limit(1);
  return inquiry;
}

function tokenUnavailable(inquiry: typeof inquiriesTable.$inferSelect) {
  return Boolean(
    inquiry.accessTokenRevokedAt ||
      !inquiry.accessTokenExpiresAt ||
      inquiry.accessTokenExpiresAt.getTime() < Date.now(),
  );
}

export async function GET(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) return apiServiceUnavailable("Servis kullanılamıyor.");
  if (
    !(await checkRateLimit(`${requestIp(req)}`, {
      name: "portal-data",
      windowMs: 60_000,
      limit: 20,
    }))
  ) {
    return apiRateLimited();
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  if (!inquiry || tokenUnavailable(inquiry)) return apiNotFound("Geçersiz bağlantı.");

  const data = await exportInquiryPersonalData(getDb(), inquiry);
  return apiOk({ data });
}

export async function POST(req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) return apiServiceUnavailable("Servis kullanılamıyor.");
  // Silme geri alınamaz — yazma limiti okumadan sıkı.
  if (
    !(await checkRateLimit(`${requestIp(req)}`, {
      name: "portal-erase",
      windowMs: 60_000,
      limit: 5,
    }))
  ) {
    return apiRateLimited();
  }

  const { token } = await params;
  const inquiry = await findByToken(token);
  // İkinci çağrıda token zaten iptal edilmiş olur → 404. Bu beklenen davranış:
  // anonimleştirme idempotenttir ama bağlantı tek kullanımlıktır.
  if (!inquiry || tokenUnavailable(inquiry)) return apiNotFound("Geçersiz bağlantı.");

  await anonymizeInquiry(getDb(), inquiry.id);

  // Denetim izi: kişisel veri değil, yalnızca işlemin yapıldığı gerçeği.
  await logAudit({
    actor: null,
    actorLabel: "misafir-portali",
    action: "talep.kisisel-veri-silindi",
    entityType: "inquiry",
    entityId: inquiry.id,
    meta: { hotelId: inquiry.hotelId },
  });

  return apiOk({ anonymized: true });
}
