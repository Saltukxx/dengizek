// ---------------------------------------------------------------------------
// oteldenrezerve.com'dan kazınan otelleri Otelsayfam'a TASLAK olarak aktarır.
//
// Girdi: scripts/oteldenrezerve/scrape.py çıktısı (oteller.json + images/<slug>/...).
// Kullanım:
//   npm run import:oteldenrezerve -- <klasör> [--dry-run] [--only <slug>]
//
// - Oteller "taslak" açılır; misafire görünmez, admin inceleyip yayına alır.
// - Aynı slug'la otel zaten varsa ATLANIR (panelde düzenlenmiş veriyi ezmemek için).
// - Fotoğraflar storeImage ile yüklenir: R2 ayarlıysa R2'ye, değilse public/uploads.
// - Metinlerde telefon/e-posta/web adresi geçen satırlar ve "Oteldenrezerve"
//   marka cümleleri çıkarılır (platform dışı iletişim kuralı).
// - Fiyat aktarılmaz: odalar "talep üzerine" açılır, fiyat panelden girilir.
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { hotelGalleryImagesTable, hotelsTable, roomsTable } from "../src/lib/db/schema";
import {
  CHECK_IN_LABELS,
  CHECK_OUT_LABELS,
  boardTypeOf,
  cleanText,
  fixCaps,
  petsAllowedOf,
  roomFacts,
  shortDescriptionOf,
  stats,
  timeAfter,
} from "../src/lib/import/oteldenrezerve-text";
import { hasSafeImageDimensions, hasValidImageSignature, storeImage } from "../src/lib/object-storage";

interface ScrapedImage { url: string; dosya: string; baslik?: string }
interface ScrapedRoom { ad: string; slug: string; aciklama: string; fotograflar: ScrapedImage[] }
interface ScrapedHotel {
  kaynak_url: string;
  slug: string;
  ad: string;
  konum: string;
  belge_no: string;
  galeri: ScrapedImage[];
  bolumler: Array<{ baslik: string; metin: string }>;
  olanaklar: Array<{ baslik: string; ozellikler: string[] }>;
  odalar: ScrapedRoom[];
  liste: { il?: string; ilce?: string; bolge?: string; pansiyon?: string; cocuk_notu?: string };
}


const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

// ---------------------------------------------------------------------------
// Metin temizliği ve alan çıkarımı
// ---------------------------------------------------------------------------

function section(hotel: ScrapedHotel, title: RegExp): string {
  return hotel.bolumler.find((s) => title.test(s.baslik))?.metin ?? "";
}

function contentTypeOf(bytes: Uint8Array): string | null {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    if (hasValidImageSignature(type, bytes)) return type;
  }
  return null;
}

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base || "oda";
  for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Aktarım
// ---------------------------------------------------------------------------

async function uploadImage(hotelId: string, file: string) {
  const bytes = new Uint8Array(await readFile(path.join(dir!, file)));
  const type = contentTypeOf(bytes);
  if (!type || !hasSafeImageDimensions(type, bytes)) throw new Error(`geçersiz görsel: ${file}`);
  return storeImage(hotelId, type, bytes);
}

async function main() {
  if (!dir) throw new Error("Kullanım: import-oteldenrezerve <klasör> [--dry-run] [--only <slug>]");
  const hotels = (JSON.parse(await readFile(path.join(dir, "oteller.json"), "utf-8")) as ScrapedHotel[])
    .filter((h) => !only || h.slug === only);
  const db = dryRun ? null : getDb();
  const report = { created: 0, skipped: [] as string[], imageErrors: [] as string[], unknownBoard: [] as string[] };

  for (const h of hotels) {
    const info = cleanText(section(h, /tesis bilgi/i));
    const notes = section(h, /^notlar/i);
    const allText = h.bolumler.map((x) => x.metin).join("\n");
    const roomsText = section(h, /oda özellik/i);
    const totalRooms = Number(roomsText.match(/toplam\s+(\d{1,4})\s+oda/i)?.[1]) || null;
    // "Tesis Tipi" grubu ("Spa Otelleri", "Termal Oteller") kategori etiketidir, olanak değil.
    const amenities = [
      ...new Set(
        h.olanaklar
          .filter((f) => !/tesis tipi/i.test(f.baslik))
          .flatMap((f) => f.ozellikler)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ];
    const aiFacts = h.bolumler
      .filter((s) => !/tesis bilgi|^notlar/i.test(s.baslik) && s.metin.trim())
      .map((s) => `${s.baslik}: ${cleanText(s.metin)}`.slice(0, 1500))
      .filter((f) => f.length > 10);
    const aiPolicies = cleanText(notes)
      .split("\n")
      .map((l) => l.replace(/^\*+\s*/, "").trim())
      .filter((l) => l.length > 3);
    const board = boardTypeOf(h.liste.pansiyon);
    if (!board) report.unknownBoard.push(h.slug);

    const values = {
      slug: h.slug,
      name: fixCaps(h.ad),
      city: h.liste.il || h.konum.split("/")[0]?.trim() || null,
      country: "Türkiye",
      shortDescription: shortDescriptionOf(info),
      longDescription: info || null,
      address: [h.konum, h.liste.bolge].filter(Boolean).join(" / ") || null,
      totalRooms,
      checkInTime: timeAfter(allText, CHECK_IN_LABELS),
      checkOutTime: timeAfter(allText, CHECK_OUT_LABELS),
      petsAllowed: petsAllowedOf(allText),
      childPolicy: h.liste.cocuk_notu || null,
      amenities,
      aiFacts,
      aiPolicies,
      propertyType: "otel" as const,
      status: "taslak" as const,
    };

    if (dryRun) {
      console.log(`\n# ${h.ad} (${h.slug})`);
      console.log({ ...values, longDescription: values.longDescription?.slice(0, 120), aiFacts: aiFacts.length, amenities: amenities.length });
      console.log(`  galeri: ${h.galeri.length}, odalar: ${h.odalar.map((r) => `${fixCaps(r.ad)} (${r.fotograflar.length} foto, ${JSON.stringify(roomFacts(r.aciklama))})`).join(", ")}`);
      continue;
    }

    const [existing] = await db!.select({ id: hotelsTable.id }).from(hotelsTable).where(eq(hotelsTable.slug, h.slug)).limit(1);
    if (existing) {
      report.skipped.push(h.slug);
      console.log(`- ${h.slug}: zaten var, atlandı`);
      continue;
    }

    const [hotel] = await db!.insert(hotelsTable).values(values).returning();
    const hotelId = hotel!.id;

    // Galeri
    let cover: string | null = null;
    let order = 0;
    for (const img of h.galeri) {
      try {
        const stored = await uploadImage(hotelId, img.dosya);
        cover ??= stored.url;
        await db!.insert(hotelGalleryImagesTable).values({
          hotelId,
          url: stored.url,
          objectKey: stored.key,
          caption: img.baslik && img.baslik !== h.ad ? img.baslik : null,
          sortOrder: order++,
        });
      } catch (error) {
        report.imageErrors.push(`${h.slug}/${img.dosya}: ${(error as Error).message}`);
      }
    }

    // Odalar
    const usedSlugs = new Set<string>();
    for (const [index, room] of h.odalar.entries()) {
      const description = cleanText(room.aciklama);
      const facts = roomFacts(description);
      const [row] = await db!
        .insert(roomsTable)
        .values({
          hotelId,
          slug: uniqueSlug(room.slug, usedSlugs),
          name: fixCaps(room.ad),
          description: description || null,
          sizeSqm: facts.sizeSqm,
          capacityAdults: facts.capacityAdults ?? 2,
          capacityChildren: facts.capacityChildren ?? 0,
          boardType: board ?? "sadece-oda",
          priceOnRequest: true,
          orderIndex: index,
        })
        .returning();
      const urls: string[] = [];
      for (const img of room.fotograflar) {
        try {
          const stored = await uploadImage(hotelId, img.dosya);
          urls.push(stored.url);
          await db!.insert(hotelGalleryImagesTable).values({
            hotelId,
            roomId: row!.id,
            url: stored.url,
            objectKey: stored.key,
            caption: fixCaps(room.ad),
            sortOrder: order++,
          });
        } catch (error) {
          report.imageErrors.push(`${h.slug}/${img.dosya}: ${(error as Error).message}`);
        }
      }
      if (urls.length) {
        await db!.update(roomsTable).set({ imageUrl: urls[0], galleryUrls: urls }).where(eq(roomsTable.id, row!.id));
      }
    }
    if (cover) await db!.update(hotelsTable).set({ imageUrl: cover }).where(eq(hotelsTable.id, hotelId));

    report.created += 1;
    console.log(`✓ ${h.ad}: ${h.galeri.length} galeri, ${h.odalar.length} oda`);
  }

  console.log("\n--- Rapor ---");
  console.log(`Oluşturulan: ${report.created}, atlanan (zaten var): ${report.skipped.length}`);
  console.log(
    `Çıkarılan iletişim satırı: ${stats.droppedContactLines}, "Oteldenrezerve" cümlesi: ${stats.droppedBrandSentences}, SEO anahtar kelime satırı: ${stats.droppedKeywordLines}`,
  );
  if (report.unknownBoard.length) console.log(`Pansiyon tipi bilinmeyen (oda: sadece-oda, panelden düzeltin): ${report.unknownBoard.join(", ")}`);
  if (report.imageErrors.length) console.log(`Görsel hataları (${report.imageErrors.length}):\n  ${report.imageErrors.join("\n  ")}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
