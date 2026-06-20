// ---------------------------------------------------------------------------
// Seed script — demo otel verisini DB'ye aktar
// Çalıştırmak: npx tsx src/lib/db/seed.ts
// ---------------------------------------------------------------------------
// Gereksinimler: DATABASE_URL ortam değişkeni tanımlı olmalı (.env.local)
// ---------------------------------------------------------------------------

import { eq, and } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "@/lib/auth/password";
import {
  extrasTable,
  hotelMembersTable,
  hotelsTable,
  restaurantsTable,
  roomRatesTable,
  roomsTable,
  tourStepsTable,
  toursTable,
  usersTable,
} from "./schema";
import { getManifestFromDB } from "./manifest";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL tanımlı değil. .env.local dosyanızı kontrol edin.");
    process.exit(1);
  }

  const db = drizzle(neon(url), {
    schema: { hotelsTable, tourStepsTable, usersTable, hotelMembersTable, toursTable },
  });

  console.log("Otel kaydı ekleniyor...");
  await db
    .insert(hotelsTable)
    .values({
      slug:             "aurelia-bay",
      name:             "Aurelia Bay Otel",
      city:             "Dubrovnik",
      country:          "Hirvatistan",
      shortDescription: "Teras havuzu ve Adriyatik manzarasi.",
      longDescription:  "Sakin bir lobi, spa erisimi ve suitlerde gun isigini iceri alan genis camlar.",
      imageUrl:         "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
      priceLabel:       "Talep uzerine",
      aiPersona:        "Yapay Zeka Rehberi",
      aiLanguage:       "tr",
      aiFacts: [
        "5 yildiz otel",
        "200 oda kapasitesi",
        "1923 yilinda kuruldu",
        "Turkiye'nin guneybati sahilinde, Ege'ye sifir konumda",
        "Ozel 200 metre kumsali var",
        "3 restoran, 2 bar, 1 spa merkezi mevcut",
      ],
      aiPolicies: [
        "Check-in saati: 14:00",
        "Check-out saati: 12:00",
        "Ucretsiz iptal: rezervasyondan 48 saat oncesine kadar",
        "Evcil hayvan kabul edilmez",
        "Cocuk politikasi: her yasa uygundur",
        "Ucretsiz Wi-Fi tum alanlarda mevcut",
      ],
      // Demo otel dogrudan yayinda baslar (moderasyon onayli kabul edilir)
      status: "yayinda",
    })
    .onConflictDoUpdate({
      target: hotelsTable.slug,
      set: {
        aiPersona:   "Yapay Zeka Rehberi",
        aiLanguage:  "tr",
        status:      "yayinda",
        updatedAt:   new Date(),
      },
    });

  console.log("Tur adimlari ekleniyor...");
  const stepRows = [
    {
      hotelSlug: "aurelia-bay",
      tourId:    "demo-lobby",
      stepId:    "s1",
      title:     "Lobide hos geldiniz",
      kind:      "lobby",
      orderIndex: 0,
      requiresUserContinue: true,
      body: "Bu kisa bir ornek kliptir. Bittiginde yol secin veya son adima atlayin.",
      mediaUrl: "/demo/local-sample.mp4",
      media: { mode: "clip" as const, endSec: 4 },
      captionsVttUrl: "/demo/sample-tr.vtt",
      aiTags: ["lobi", "lobby", "giris", "karsilama", "resepsiyon", "entrance", "reception"],
      aiDescription: "Otelin 2019'da restore edilen ana lobisi. Yerel sanatcilarin eserleriyle dekore edilmis, 24 saat acik resepsiyon ve concierge hizmeti mevcut.",
      aiPromo: ["24 saat concierge hizmeti", "Lobi bar her gun 10:00-24:00 arasi acik", "2019'da odullu mimarlar tarafindan restore edildi"],
      aiVisible: true,
      callouts: [
        { id: "co1", tSec: 0.2, title: "Panoramik lobi (demo)", body: "Kaydirici ile klibin icinde gezinin.", placement: "topStart" },
        { id: "co2", tSec: 0.6, title: "Tam ekran (demo)", body: "Kose aciklamalari tam ekran modunda birlikte gorunur.", placement: "bottomEnd" },
      ],
      branches: [
        { id: "b1", label: "Siradaki sahneye (demo)", nextStepId: "s2" },
        { id: "b2", label: "Son adima atla (demo)", nextStepId: "s3" },
      ],
      hotspots: [],
    },
    {
      hotelSlug: "aurelia-bay",
      tourId:    "demo-lobby",
      stepId:    "s2",
      title:     "Sahil ve Plaj Alani",
      kind:      "amenity_spot",
      orderIndex: 1,
      requiresUserContinue: false,
      body: "Video bitince bu adim kendiligindan ilerler.",
      mediaUrl: "/demo/local-sample.mp4",
      media: { mode: "clip" as const },
      aiTags: ["sahil", "plaj", "deniz", "beach", "kumsal", "yuzme", "kiy"],
      aiDescription: "Otelin 200 metre uzunlugundaki ozel kumsali. Sezlong ve semsiye hizmeti ucretsiz, su sporlari merkezi ve plaj bari mevcut.",
      aiPromo: ["Sezlong ve semsiye tamamen ucretsiz", "Sorf, jet ski ve kano kiralama imkani", "Gunbatiminda canli muzik ve kokteyl servisi"],
      aiVisible: true,
      callouts: [],
      branches: [],
      hotspots: [
        { id: "h1", xPct: 50, yPct: 45, label: "Plaj bari", body: "Taze meyve sulari ve soguk icecekler, her gun 10:00-20:00.", tSec: 0 },
      ],
    },
    {
      hotelSlug: "aurelia-bay",
      tourId:    "demo-lobby",
      stepId:    "s3",
      title:     "Deniz Manzarali Suit",
      kind:      "room",
      orderIndex: 2,
      requiresUserContinue: true,
      body: "Demo turu tamamladiniz.",
      mediaUrl: "/demo/local-sample.mp4",
      media: { mode: "clip" as const },
      aiTags: ["oda", "suit", "suite", "deniz manzarasi", "yatak odasi", "room", "sea view", "balkon"],
      aiDescription: "45 m2 deniz manzarali suit. King size yatak, ozel balkon, jakuzi ve minibar dahil. Ege manzarasina bakan panoramik cam.",
      aiPromo: ["Her odadan Ege manzarasi", "Jakuzi ve ozel balkon dahil", "Gunluk ucretsiz minibar yenileme"],
      aiVisible: true,
      callouts: [],
      branches: [],
      hotspots: [],
    },
  ] as const;

  for (const row of stepRows) {
    const writableRow = {
      ...row,
      aiTags: [...row.aiTags],
      aiPromo: [...row.aiPromo],
      callouts: row.callouts.map((callout) => ({ ...callout })),
      branches: row.branches.map((branch) => ({ ...branch })),
      hotspots: row.hotspots.map((hotspot) => ({ ...hotspot })),
    };

    await db
      .insert(tourStepsTable)
      .values(writableRow)
      .onConflictDoUpdate({
        target: [tourStepsTable.hotelSlug, tourStepsTable.tourId, tourStepsTable.stepId],
        set: {
          title:          writableRow.title,
          aiTags:         writableRow.aiTags,
          aiDescription:  writableRow.aiDescription,
          aiPromo:        writableRow.aiPromo,
          aiVisible:      writableRow.aiVisible,
          mediaUrl:       writableRow.mediaUrl,
        },
      });
    console.log(`  ✓ ${row.stepId}: ${row.title}`);
  }

  // -------------------------------------------------------------------------
  // Kullanicilar — YALNIZCA GELISTIRME ICINDIR, uretimde bu sifreler kullanilmaz
  //   admin@dengizek.dev    / Admin123!     (platform yoneticisi)
  //   yonetici@aurelia.dev  / Yonetici123!  (aurelia-bay sahibi)
  // -------------------------------------------------------------------------
  console.log("Kullanicilar ekleniyor...");

  const devUsers = [
    { email: "admin@dengizek.dev",   name: "Platform Yoneticisi", role: "admin" as const,   password: "Admin123!" },
    { email: "yonetici@aurelia.dev", name: "Aurelia Yoneticisi",  role: "manager" as const, password: "Yonetici123!" },
  ];

  for (const u of devUsers) {
    const passwordHash = await hashPassword(u.password);
    await db
      .insert(usersTable)
      .values({ email: u.email, name: u.name, role: u.role, passwordHash })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: { name: u.name, role: u.role, passwordHash, isActive: true, updatedAt: new Date() },
      });
    console.log(`  ✓ ${u.email} (${u.role})`);
  }

  // -------------------------------------------------------------------------
  // Otel uyeligi — yonetici@aurelia.dev -> aurelia-bay (owner)
  // -------------------------------------------------------------------------
  console.log("Otel uyeligi ekleniyor...");

  const [hotel] = await db
    .select({ id: hotelsTable.id })
    .from(hotelsTable)
    .where(eq(hotelsTable.slug, "aurelia-bay"))
    .limit(1);
  const [manager] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "yonetici@aurelia.dev"))
    .limit(1);

  if (hotel && manager) {
    await db
      .insert(hotelMembersTable)
      .values({ userId: manager.id, hotelId: hotel.id, role: "owner" })
      .onConflictDoNothing();
    console.log("  ✓ yonetici@aurelia.dev -> aurelia-bay (owner)");
  }

  // -------------------------------------------------------------------------
  // Tur kaydi + yayin anlik goruntusu (snapshot) backfill
  // tour_steps'teki taslaktan manifest uretilir ve publishedManifest'e yazilir.
  // -------------------------------------------------------------------------
  console.log("Tur kaydi ve yayin snapshot'i olusturuluyor...");

  const manifest = await getManifestFromDB("aurelia-bay", "demo-lobby");
  if (!manifest || !hotel) {
    console.error("Manifest uretilemedi — tur adimlari eksik olabilir.");
    process.exit(1);
  }

  const now = new Date();
  const [existingTour] = await db
    .select({ id: toursTable.id, version: toursTable.version })
    .from(toursTable)
    .where(and(eq(toursTable.hotelSlug, "aurelia-bay"), eq(toursTable.tourId, "demo-lobby")))
    .limit(1);

  if (existingTour) {
    await db
      .update(toursTable)
      .set({ publishedManifest: manifest, status: "yayinda", publishedAt: now, updatedAt: now })
      .where(eq(toursTable.id, existingTour.id));
  } else {
    await db.insert(toursTable).values({
      hotelId:           hotel.id,
      hotelSlug:         "aurelia-bay",
      tourId:            "demo-lobby",
      title:             "Lobi turu (demo)",
      status:            "yayinda",
      version:           1,
      publishedManifest: manifest,
      publishedAt:       now,
    });
  }
  console.log("  ✓ demo-lobby (yayinda, v" + (existingTour?.version ?? 1) + ")");

  // -------------------------------------------------------------------------
  // Otel ozellikleri (specifications + olanaklar)
  // -------------------------------------------------------------------------
  console.log("Otel ozellikleri guncelleniyor...");
  await db
    .update(hotelsTable)
    .set({
      starRating:   5,
      totalRooms:   200,
      checkInTime:  "14:00",
      checkOutTime: "12:00",
      amenities: [
        "ucretsiz-wifi", "klima", "resepsiyon-7-24", "oda-servisi", "concierge",
        "acik-havuz", "cocuk-havuzu", "ozel-plaj", "sezlong-semsiye", "plaj-bari",
        "spa-merkezi", "hamam", "sauna", "fitness",
        "restoran", "bar", "kahvalti-dahil",
        "cocuk-kulubu", "aile-odalari",
        "su-sporlari", "canli-muzik",
        "otopark", "havalimani-transferi",
        "engelli-erisimi", "asansor",
      ],
      // Politikalar + iletisim
      cancellationPolicy: "Rezervasyondan 48 saat oncesine kadar ucretsiz iptal. Sonrasinda ilk gece ucreti tahsil edilir.",
      childPolicy: "0-6 yas ucretsiz, 7-12 yas %50 indirimli konaklar. Bebek yatagi ucretsizdir.",
      petsAllowed: false,
      paymentMethods: ["nakit", "kredi-karti", "havale", "online"],
      address: "Aurelia Koyu Mevkii No:1, Dubrovnik",
      phone: "+385 20 555 0100",
      contactEmail: "rezervasyon@aureliabay.example",
      airportDistanceKm: 35,
      updatedAt: new Date(),
    })
    .where(eq(hotelsTable.slug, "aurelia-bay"));
  console.log("  ✓ 5 yildiz, 200 oda, 25 olanak, politikalar + iletisim");

  // -------------------------------------------------------------------------
  // Odalar — mock roomTypes ile ayni slug'lar (misafir rotalari uyumlu)
  // -------------------------------------------------------------------------
  console.log("Odalar ekleniyor...");
  const roomRows = [
    {
      slug: "seaview-deluxe",
      name: "Deniz Manzarali Deluxe",
      tagline: "32 m2 - yatak odasi, balkon",
      description: "Notr tonlar, yagmur dusu ve deniz esintisine acilan balkon.",
      sizeSqm: 32,
      capacityAdults: 2,
      capacityChildren: 1,
      bedConfig: "1 king yatak",
      viewType: "Deniz manzarasi",
      imageUrl: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80",
      amenities: ["Balkon", "Yagmur dusu", "Minibar", "Smart TV", "Klima"],
      boardType: "kahvalti-dahil",
      unitCount: 40,
      minStayNights: 1,
      pricingNotes: "3. kisi +800 TL/gece. 0-6 yas ucretsiz.",
      priceMinor: 450000, // 4.500 TL
      currency: "TRY",
      priceOnRequest: false,
      discountPercent: 10,
      discountLabel: "Erken rezervasyona ozel",
      orderIndex: 0,
    },
    {
      slug: "courtyard-quiet",
      name: "Avlu Sessiz",
      tagline: "28 m2 - avlu manzarasi",
      description: "Daha sakin avlu manzarasi; uzun konaklamalar icin ideal.",
      sizeSqm: 28,
      capacityAdults: 2,
      capacityChildren: 0,
      bedConfig: "1 cift kisilik yatak",
      viewType: "Avlu manzarasi",
      imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80",
      amenities: ["Calisma masasi", "Minibar", "Klima", "Ses yalitimi"],
      boardType: "kahvalti-dahil",
      unitCount: 60,
      priceMinor: 320000, // 3.200 TL
      currency: "TRY",
      priceOnRequest: false,
      orderIndex: 1,
    },
  ];

  for (const room of roomRows) {
    await db
      .insert(roomsTable)
      .values({ ...room, hotelId: hotel.id })
      .onConflictDoUpdate({
        target: [roomsTable.hotelId, roomsTable.slug],
        set: { ...room, updatedAt: new Date() },
      });
    console.log(`  ✓ ${room.slug}: ${room.name}`);
  }

  // -------------------------------------------------------------------------
  // Donemsel fiyatlar — seaview-deluxe icin 2 donem
  // Idempotent: (roomId, name) uzerinden select-then-upsert
  // -------------------------------------------------------------------------
  console.log("Donemsel fiyatlar ekleniyor...");
  const [seaviewRoom] = await db
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotel.id), eq(roomsTable.slug, "seaview-deluxe")))
    .limit(1);

  if (seaviewRoom) {
    const rateRows = [
      {
        name: "Yaz 2026",
        startDate: "2026-06-01",
        endDate: "2026-09-15",
        priceMinor: 620000, // 6.200 TL
        currency: "TRY",
        minStayNights: 2,
      },
      {
        name: "Kis 2026-27",
        startDate: "2026-11-01",
        endDate: "2027-03-31",
        priceMinor: 340000, // 3.400 TL
        currency: "TRY",
        minStayNights: null,
      },
    ];
    for (const rate of rateRows) {
      const [existingRate] = await db
        .select({ id: roomRatesTable.id })
        .from(roomRatesTable)
        .where(
          and(eq(roomRatesTable.roomId, seaviewRoom.id), eq(roomRatesTable.name, rate.name)),
        )
        .limit(1);
      if (existingRate) {
        await db
          .update(roomRatesTable)
          .set({ ...rate, updatedAt: new Date() })
          .where(eq(roomRatesTable.id, existingRate.id));
      } else {
        await db
          .insert(roomRatesTable)
          .values({ ...rate, roomId: seaviewRoom.id, hotelId: hotel.id });
      }
      console.log(`  ✓ ${rate.name} (${rate.startDate} → ${rate.endDate})`);
    }
  }

  // -------------------------------------------------------------------------
  // Restoran + menu (jsonb)
  // -------------------------------------------------------------------------
  console.log("Restoran ekleniyor...");
  const menu = [
    {
      id: "baslangiclar",
      title: "Baslangiclar",
      items: [
        { id: "m1", name: "Gunun corbasi", description: "Mevsim sebzeleriyle", priceMinor: 18000, currency: "TRY", priceOnRequest: false, tags: ["vejetaryen"] },
        { id: "m2", name: "Deniz mahsullu salata", description: "Karides, ahtapot, roka", priceMinor: 42000, currency: "TRY", priceOnRequest: false, tags: [] },
        { id: "m3", name: "Humus tabagi", description: "Zeytinyagi ve pul biberle", priceMinor: 22000, currency: "TRY", priceOnRequest: false, tags: ["vegan", "glutensiz"] },
      ],
    },
    {
      id: "ana-yemekler",
      title: "Ana Yemekler",
      items: [
        { id: "m4", name: "Izgara levrek", description: "Gunluk, sebze garniturlu", priceMinor: 78000, currency: "TRY", priceOnRequest: false, tags: ["glutensiz"] },
        { id: "m5", name: "Kuzu incik", description: "Firin sebzeleri ve pure ile", priceMinor: 92000, currency: "TRY", priceOnRequest: false, tags: [] },
        { id: "m6", name: "Sebzeli risotto", description: "Parmesan ve mevsim sebzeleri", priceMinor: 56000, currency: "TRY", priceOnRequest: false, tags: ["vejetaryen"] },
      ],
    },
  ];

  const [existingRestaurant] = await db
    .select({ id: restaurantsTable.id })
    .from(restaurantsTable)
    .where(and(eq(restaurantsTable.hotelId, hotel.id), eq(restaurantsTable.name, "Aurelia Teras")))
    .limit(1);

  const restaurantValues = {
    hotelId: hotel.id,
    name: "Aurelia Teras",
    description: "Deniz manzarali teras restorani — Akdeniz mutfagindan secmeler.",
    cuisine: "Akdeniz mutfagi",
    hours: "07:00 - 23:00",
    location: "Lobi kati, deniz tarafi",
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
    menu,
    orderIndex: 0,
  };

  if (existingRestaurant) {
    await db
      .update(restaurantsTable)
      .set({ ...restaurantValues, updatedAt: new Date() })
      .where(eq(restaurantsTable.id, existingRestaurant.id));
  } else {
    await db.insert(restaurantsTable).values(restaurantValues);
  }
  console.log("  ✓ Aurelia Teras (2 bolum, 6 urun)");

  // -------------------------------------------------------------------------
  // Ekstralar
  // -------------------------------------------------------------------------
  console.log("Ekstralar ekleniyor...");
  const extraRows = [
    {
      name: "Havalimani transferi",
      description: "Ozel aracla karsilama ve otele transfer (tek yon).",
      category: "transfer",
      unitLabel: "arac basina",
      priceMinor: 150000,
      currency: "TRY",
      priceOnRequest: false,
      orderIndex: 0,
    },
    {
      name: "Spa paketi",
      description: "60 dk masaj + hamam + sauna kullanimi.",
      category: "spa",
      unitLabel: "kisi basi",
      priceMinor: 280000,
      currency: "TRY",
      priceOnRequest: false,
      discountPercent: 15,
      discountLabel: "Konaklayan misafire ozel",
      orderIndex: 1,
    },
    {
      name: "Romantik aksam yemegi",
      description: "Sahilde ozel masa, 4 tabakli menu ve bir sise yerel sarap.",
      category: "romantik",
      unitLabel: "cift basina",
      priceMinor: null,
      currency: "TRY",
      priceOnRequest: true,
      orderIndex: 2,
    },
  ];

  for (const extra of extraRows) {
    const [existingExtra] = await db
      .select({ id: extrasTable.id })
      .from(extrasTable)
      .where(and(eq(extrasTable.hotelId, hotel.id), eq(extrasTable.name, extra.name)))
      .limit(1);
    if (existingExtra) {
      await db
        .update(extrasTable)
        .set({ ...extra, updatedAt: new Date() })
        .where(eq(extrasTable.id, existingExtra.id));
    } else {
      await db.insert(extrasTable).values({ ...extra, hotelId: hotel.id });
    }
    console.log(`  ✓ ${extra.name}`);
  }

  console.log("\nSeed tamamlandi!");
}

seed().catch((err) => {
  console.error("Seed hatasi:", err);
  process.exit(1);
});
