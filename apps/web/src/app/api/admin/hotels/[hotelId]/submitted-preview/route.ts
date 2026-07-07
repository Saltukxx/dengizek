import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { parseHotelContentSnapshot } from "@/lib/schemas/hotel-content-snapshot";
import { snapshotDiffSummary } from "@/lib/hotel-content-snapshot";
import { apiFail, apiOk } from "@/lib/api-response";

export async function GET(_req: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const { hotelId } = await params;
  const [hotel] = await getDb().select({
    submittedSnapshot: hotelsTable.submittedSnapshot,
    publishedSnapshot: hotelsTable.publishedSnapshot,
    submittedRevision: hotelsTable.submittedRevision,
    publishedRevision: hotelsTable.publishedRevision,
  }).from(hotelsTable).where(eq(hotelsTable.id, hotelId)).limit(1);
  const submitted = parseHotelContentSnapshot(hotel?.submittedSnapshot);
  if (!submitted.success) return apiFail("Gönderilmiş snapshot bulunamadı veya geçersiz.", 404);
  const published = parseHotelContentSnapshot(hotel?.publishedSnapshot);
  return apiOk({
    submittedRevision: hotel?.submittedRevision,
    publishedRevision: hotel?.publishedRevision,
    snapshot: submitted.data,
    diff: snapshotDiffSummary(published.success ? published.data : null, submitted.data),
  });
}
