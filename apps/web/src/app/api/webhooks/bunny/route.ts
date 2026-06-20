// ---------------------------------------------------------------------------
// POST /api/webhooks/bunny?secret=... — Bunny Stream durum webhook'u
//
// Doğrulama: Bunny webhook imzalamaz → paylaşılan sır query/header ile gelir,
// sabit-zamanlı karşılaştırma yapılır (BUNNY_WEBHOOK_SECRET).
//
// Status haritası: 0-3 → isleniyor, 4 → hazir (playback/thumbnail yazılır),
// 5 → hata. "yayinlandi" buradan değil, tur yayınında set edilir.
// Idempotent: aynı event tekrarında sorun çıkmaz; bilinmeyen GUID → 200 + log
// (Bunny'nin retry fırtınası tetiklenmesin).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { mediaAssetsTable } from "@/lib/db/schema";
import { bunnyWebhookSchema } from "@/lib/schemas/media";
import { playbackUrl, thumbnailUrl } from "@/lib/bunny/client";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = process.env.BUNNY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Webhook yapılandırılmamış." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Veritabanı yok." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bunnyWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz webhook gövdesi." },
      { status: 400 },
    );
  }

  const { VideoGuid, Status } = parsed.data;

  const db = getDb();
  const [asset] = await db
    .select({ id: mediaAssetsTable.id, status: mediaAssetsTable.status })
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.bunnyVideoGuid, VideoGuid))
    .limit(1);

  if (!asset) {
    // Bilinmeyen GUID — 200 dön ki Bunny tekrar tekrar denemesin
    console.warn(`[webhook/bunny] bilinmeyen GUID: ${VideoGuid} (Status ${Status})`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const now = new Date();

  if (Status === 5) {
    await db
      .update(mediaAssetsTable)
      .set({
        status: "hata",
        errorMessage: "Video kodlama başarısız oldu.",
        updatedAt: now,
      })
      .where(eq(mediaAssetsTable.id, asset.id));
    return NextResponse.json({ ok: true, status: "hata" });
  }

  if (Status === 4) {
    await db
      .update(mediaAssetsTable)
      .set({
        status: "hazir",
        playbackUrl: playbackUrl(VideoGuid),
        thumbnailUrl: thumbnailUrl(VideoGuid) || null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(mediaAssetsTable.id, asset.id));
    return NextResponse.json({ ok: true, status: "hazir" });
  }

  // 0-3 ve 6 — işleme sürüyor; yayinlandi durumunu geri çevirme
  if (asset.status !== "hazir" && asset.status !== "yayinlandi") {
    await db
      .update(mediaAssetsTable)
      .set({ status: "isleniyor", updatedAt: now })
      .where(eq(mediaAssetsTable.id, asset.id));
  }

  return NextResponse.json({ ok: true, status: "isleniyor" });
}
