import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";
import { safeParseTourManifest } from "@/lib/schemas/tour-manifest";
import { apiFail, apiOk } from "@/lib/api-response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const { id } = await params;
  const [tour] = await getDb().select({ submittedManifest: toursTable.submittedManifest, submittedRevision: toursTable.submittedRevision })
    .from(toursTable).where(eq(toursTable.id, id)).limit(1);
  const parsed = safeParseTourManifest(tour?.submittedManifest);
  if (!parsed.success) return apiFail("Gönderilmiş tur snapshot'ı bulunamadı.", 404);
  return apiOk({ manifest: parsed.data, submittedRevision: tour?.submittedRevision });
}
