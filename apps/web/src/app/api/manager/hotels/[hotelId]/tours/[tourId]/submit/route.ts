// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/tours/[tourId]/submit
// Taslağı bütünlük kontrolünden geçirip incelemeye gönderir
// (taslak | reddedildi | yayinda → incelemede)
//
// Yayındaki tur da doğrudan gönderilebilir: oynatıcı publishedManifest okur
// (bkz. getPublishedManifest), yani inceleme süresince tur oynatılabilir kalır.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { mediaAssetsTable, toursTable } from "@/lib/db/schema";
import { getManifestFromDB } from "@/lib/db/manifest";
import { tourManifestSchema } from "@/lib/schemas/tour-manifest";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [tour] = await db
    .select()
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, guard.hotel.id), eq(toursTable.tourId, tourId)))
    .limit(1);

  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }
  // Tek engel: bekleyen ve hâlâ güncel bir gönderim varsa tekrar gönderme.
  if (tour.status === "incelemede" && tour.submittedRevision === tour.draftRevision) {
    return NextResponse.json(
      { ok: false, error: "Bu sürüm zaten incelemede." },
      { status: 409 },
    );
  }

  // Taslak bütünlük kontrolü: manifest şeması + dal hedefleri
  const draft = await getManifestFromDB(guard.hotel.slug, tourId);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Tur adımları eksik — incelemeye göndermeden önce en az bir adım ekleyin." },
      { status: 400 },
    );
  }

  const validated = tourManifestSchema.safeParse(draft);
  if (!validated.success) {
    return NextResponse.json(
      { ok: false, error: "Tur taslağı geçersiz", issues: validated.error.flatten() },
      { status: 400 },
    );
  }

  const stepIds = new Set(draft.steps.map((s) => s.stepId));
  for (const step of draft.steps) {
    for (const branch of step.branches ?? []) {
      if (!stepIds.has(branch.nextStepId)) {
        return NextResponse.json(
          {
            ok: false,
            error: `"${step.stepId}" adımındaki dal hedefi bulunamadı: "${branch.nextStepId}"`,
          },
          { status: 400 },
        );
      }
    }
  }

  // Medya hazırlık kontrolü: boş src (ör. webhook anında CDN hostname
  // tanımsızsa playbackUrl "" döner) veya henüz işlenmemiş/hatalı varlık
  // varken tur incelemeye gönderilemez.
  for (const step of draft.steps) {
    if (!step.media.src.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: `"${step.title}" adımının videosu eksik — medya yüklemesi tamamlanmadan tur gönderilemez.`,
        },
        { status: 400 },
      );
    }
  }

  const stepSrcs = [...new Set(draft.steps.map((s) => s.media.src))];
  const assets = await db
    .select({
      playbackUrl: mediaAssetsTable.playbackUrl,
      status: mediaAssetsTable.status,
    })
    .from(mediaAssetsTable)
    .where(
      and(
        eq(mediaAssetsTable.hotelId, guard.hotel.id),
        inArray(mediaAssetsTable.playbackUrl, stepSrcs),
      ),
    );
  const assetStatusBySrc = new Map(
    assets.filter((a) => a.playbackUrl).map((a) => [a.playbackUrl as string, a.status]),
  );
  for (const step of draft.steps) {
    const assetStatus = assetStatusBySrc.get(step.media.src);
    // Harici / demo URL'ler media_assets'te yoktur — onlara karışmayız.
    if (!assetStatus) continue;
    if (assetStatus !== "hazir" && assetStatus !== "yayinlandi") {
      const reason =
        assetStatus === "hata"
          ? "video işlenirken hata oluştu"
          : "video hâlâ işleniyor";
      return NextResponse.json(
        {
          ok: false,
          error: `"${step.title}" adımının medyası hazır değil (${reason}) — hazır olmadan tur gönderilemez.`,
        },
        { status: 400 },
      );
    }
  }

  const [updated] = await db
    .update(toursTable)
    .set({
      status: "incelemede",
      submittedManifest: validated.data,
      submittedRevision: tour.draftRevision,
      submittedAt: new Date(),
      moderationNote: null,
      updatedAt: new Date(),
    })
    .where(eq(toursTable.id, tour.id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: "tur.incelemeye-gonderildi",
    entityType: "tour",
    entityId: tour.id,
    meta: { hotelSlug: guard.hotel.slug, tourId, eskiDurum: tour.status },
  });

  return NextResponse.json({ ok: true, status: updated.status, submittedRevision: updated.submittedRevision });
}
