// ---------------------------------------------------------------------------
// POST /api/manager/media/create-video
// Bunny'de video kaydı oluşturur, media_assets satırı ekler ve istemcinin
// doğrudan Bunny'ye TUS yüklemesi için imzalı kimlik bilgileri döner.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { mediaAssetsTable } from "@/lib/db/schema";
import { createVideoSchema } from "@/lib/schemas/media";
import { buildTusCredentials, createVideo } from "@/lib/bunny/client";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createVideoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const guard = await requireHotelAccess(parsed.data.hotelId);
  if (guard.response) return guard.response;

  let created;
  try {
    created = await createVideo(parsed.data.title);
  } catch (err) {
    console.error("[media] Bunny video oluşturma hatası:", err);
    return NextResponse.json(
      { ok: false, error: "Video servisi şu anda kullanılamıyor. Lütfen tekrar deneyin." },
      { status: 502 },
    );
  }

  const db = getDb();
  const [asset] = await db
    .insert(mediaAssetsTable)
    .values({
      hotelId: guard.hotel.id,
      type: "video",
      status: "yuklendi",
      title: parsed.data.title,
      bunnyVideoGuid: created.guid,
      createdBy: guard.user.id,
    })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "medya.olusturuldu",
    entityType: "media",
    entityId: asset.id,
    meta: { hotelSlug: guard.hotel.slug, guid: created.guid, mock: created.mock },
  });

  const tus = buildTusCredentials(created.guid);
  return NextResponse.json({ ok: true, asset, tus }, { status: 201 });
}
