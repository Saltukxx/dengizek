// ---------------------------------------------------------------------------
// Seed script — demo otel verisini DB'ye aktar
// Çalıştırmak: npx tsx src/lib/db/seed.ts
// ---------------------------------------------------------------------------
// Gereksinimler: DATABASE_URL ortam değişkeni tanımlı olmalı (.env.local)
// ---------------------------------------------------------------------------

import { eq, and, like, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { getDb } from "./index";
import {
  bookingsTable,
  extrasTable,
  hotelGalleryImagesTable,
  hotelMembersTable,
  hotelsTable,
  inquiriesTable,
  inquiryMessagesTable,
  restaurantsTable,
  roomInventoryTable,
  roomRatesTable,
  roomsTable,
  tourStepsTable,
  toursTable,
  usersTable,
} from "./schema";
import { getManifestFromDB } from "./manifest";
import { buildHotelContentSnapshot } from "../hotel-content-snapshot";
import { addDays, dayRange } from "../booking-stay";
import { todayIso } from "../price";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL tanımlı değil. .env.local dosyanızı kontrol edin.");
    process.exit(1);
  }

  const db = getDb();

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
      priceLabel:       "Talep üzerine",
      aiPersona:        "Yapay Zeka Rehberi",
      aiLanguage:       "tr",
      seasons:          ["yaz"],
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
        seasons:     ["yaz"],
        priceLabel:  "Talep üzerine",
        longDescription:
          "Sakin bir lobi, spa erisimi ve suitlerde gun isigini iceri alan genis camlar.",
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
      .set({ title: "Lobi turu", publishedManifest: manifest, status: "yayinda", publishedAt: now, updatedAt: now })
      .where(eq(toursTable.id, existingTour.id));
  } else {
    await db.insert(toursTable).values({
      hotelId:           hotel.id,
      hotelSlug:         "aurelia-bay",
      tourId:            "demo-lobby",
      title:             "Lobi turu",
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

  // Seed kaydı da üretimdeki onay akışı gibi değişmez bir yayın snapshot'ına
  // sahiptir; kış vitrini yalnız açıkça seçilmiş bu sezon değerini okur.
  const publishedSnapshot = await buildHotelContentSnapshot(db, hotel.id);
  await db
    .update(hotelsTable)
    .set({
      publishedSnapshot,
      publishedRevision: 1,
      status: "yayinda",
      updatedAt: new Date(),
    })
    .where(eq(hotelsTable.id, hotel.id));
  console.log("  ✓ yayin snapshot'i (yaz)");

  await seedWinterHotels(db);
  await seedOperationsDemo(db, hotel.id);

  console.log("\nSeed tamamlandi!");
}

// ---------------------------------------------------------------------------
// Kış tesisleri — /kis vitrini yalnız sezonu açıkça "kis" olan tesisi listeler.
// Yazlık demo otel kışa da işaretlenince vitrin tropik fotoğrafla açılıyordu;
// kış hunisi (liste → detay → oda → tur → talep) bu kayıtlar üzerinden yürünür.
// Görseller tek tek kontrol edilmiş kar/dağ/kayak fotoğraflarıdır.
// ---------------------------------------------------------------------------
const WINTER_TOUR_ID = "kis-turu";
const winterPhoto = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

type WinterRoom = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  sizeSqm: number;
  capacityChildren: number;
  bedConfig: string;
  viewType: string;
  photo: string;
  amenities: string[];
  unitCount: number;
  priceMinor: number;
  minStayNights?: number;
};

type WinterHotel = {
  slug: string;
  name: string;
  city: string;
  address: string;
  shortDescription: string;
  longDescription: string;
  cover: string;
  starRating: number;
  totalRooms: number;
  amenities: string[];
  facts: string[];
  gallery: { photo: string; caption: string }[];
  rooms: [WinterRoom, WinterRoom];
  /** Turun orta durağı — tesisin öne çıkan alanı. */
  highlight: { title: string; body: string; tags: string[]; description: string; promo: string[] };
};

const WINTER_HOTELS: WinterHotel[] = [
  {
    slug: "kar-zirvesi",
    name: "Kar Zirvesi",
    city: "Uludağ",
    address: "Oteller Bölgesi, Uludağ, Bursa",
    shortDescription: "Pist yanında şömineli dağ oteli.",
    longDescription:
      "Kayak odasından piste yürüyüş mesafesi. Şömineli lobi, kapalı havuz ve spa; gün sonunda hamam ve sauna.",
    cover: "1510798831971-661eb04b3739",
    starRating: 4,
    totalRooms: 48,
    amenities: ["kapali-havuz", "spa-merkezi", "hamam", "sauna", "ucretsiz-wifi", "resepsiyon-7-24", "restoran", "bar", "kahvalti-dahil", "otopark"],
    facts: ["4 yıldızlı dağ oteli", "48 oda", "Kayak odasından piste yürüyerek çıkılır", "Kapalı havuz, spa, hamam ve sauna mevcut"],
    gallery: [
      { photo: "1551524559-8af4e6624178", caption: "Pistte kayak" },
      { photo: "1418985991508-e47386d96a71", caption: "Zirve manzarası" },
      { photo: "1548777123-e216912df7d8", caption: "Karlı orman" },
      { photo: "1422207134147-65fb81f59e38", caption: "Şömine başında sıcak içecek" },
    ],
    rooms: [
      {
        slug: "somineli-suit", name: "Şömineli Suit", tagline: "38 m² — dağ manzarası",
        description: "Şömine, oturma alanı ve piste bakan balkon.", sizeSqm: 38, capacityChildren: 1,
        bedConfig: "1 king yatak", viewType: "Dağ manzarası", photo: "1566665797739-1674de7a421a",
        amenities: ["Şömine", "Balkon", "Minibar", "Yerden ısıtma"], unitCount: 12, priceMinor: 1250000, minStayNights: 2,
      },
      {
        slug: "orman-odasi", name: "Orman Odası", tagline: "28 m² — orman tarafı",
        description: "Sessiz oda; kayak odasına yakın kat.", sizeSqm: 28, capacityChildren: 0,
        bedConfig: "1 çift kişilik yatak", viewType: "Orman manzarası", photo: "1522771739844-6a9f6d5f14af",
        amenities: ["Çalışma masası", "Yerden ısıtma", "Ses yalıtımı"], unitCount: 20, priceMinor: 890000,
      },
    ],
    highlight: {
      title: "Kayak odası ve pist çıkışı", body: "Ekipman dolapları ve piste açılan kapı.",
      tags: ["kayak", "pist", "ekipman", "kayak odası"], description: "Isıtmalı kayak odası; piste yürüyerek çıkılır.",
      promo: ["Isıtmalı ekipman dolapları", "Piste yürüme mesafesi"],
    },
  },
  {
    slug: "palandoken-zirve",
    name: "Palandöken Zirve Otel",
    city: "Palandöken",
    address: "Kayak Merkezi Yolu, Palandöken, Erzurum",
    shortDescription: "2.200 metrede, telesiyej istasyonunun yanında.",
    longDescription:
      "Uzun sezonu ve toz karıyla bilinen Palandöken'in yamacında. Gece kayağına açık pistlere komşu; spa katında kapalı havuz, sauna ve masaj odaları.",
    cover: "1512273222628-4daea6e55abb",
    starRating: 5,
    totalRooms: 120,
    amenities: ["kapali-havuz", "spa-merkezi", "sauna", "masaj", "fitness", "ucretsiz-wifi", "resepsiyon-7-24", "restoran", "bar", "kahvalti-dahil", "otopark", "havalimani-transferi"],
    facts: ["5 yıldızlı kayak oteli", "120 oda", "Telesiyej istasyonu otelin yanında", "Gece kayağı yapılan pistlere komşu"],
    gallery: [
      { photo: "1551698618-1dfe5d97d256", caption: "Sabah ilk iniş" },
      { photo: "1486911278844-a81c5267e227", caption: "Zirve" },
      { photo: "1600334129128-685c5582fd35", caption: "Spa katında sıcak taş masajı" },
      { photo: "1565992441121-4367c2967103", caption: "Snowpark" },
    ],
    rooms: [
      {
        slug: "zirve-suit", name: "Zirve Suit", tagline: "46 m² — pist manzarası",
        description: "Ayrı oturma odası, geniş pencereler ve pist manzarası.", sizeSqm: 46, capacityChildren: 2,
        bedConfig: "1 king yatak + çekyat", viewType: "Pist manzarası", photo: "1505693416388-ac5ce068fe85",
        amenities: ["Oturma odası", "Minibar", "Yerden ısıtma", "Küvet"], unitCount: 18, priceMinor: 1680000, minStayNights: 2,
      },
      {
        slug: "standart-dag", name: "Dağ Odası", tagline: "26 m² — dağ tarafı",
        description: "İki kişilik sıcak oda; kayak dolabı kat koridorunda.", sizeSqm: 26, capacityChildren: 1,
        bedConfig: "1 çift kişilik yatak", viewType: "Dağ manzarası", photo: "1618773928121-c32242e63f39",
        amenities: ["Minibar", "Yerden ısıtma", "Çalışma masası"], unitCount: 60, priceMinor: 960000,
      },
    ],
    highlight: {
      title: "Telesiyej çıkışı", body: "Otelin kapısından telesiyeje otuz adım.",
      tags: ["telesiyej", "pist", "kayak"], description: "Telesiyej istasyonu otelin yanındadır; kayaklarla kapıdan çıkılır.",
      promo: ["Kapıdan piste", "Gece kayağı"],
    },
  },
  {
    slug: "kartalkaya-cam-konagi",
    name: "Kartalkaya Çam Konağı",
    city: "Kartalkaya",
    address: "Köroğlu Dağları, Kartalkaya, Bolu",
    shortDescription: "Çam ormanının içinde, aile işletmesi konak.",
    longDescription:
      "İstanbul ve Ankara'ya en yakın kayak merkezinde, çam ormanı içinde 36 odalı bir konak. Çocuk kayak okulu ve akşamları şömine başında çay servisi.",
    cover: "1445543949571-ffc3e0e2f55e",
    starRating: 4,
    totalRooms: 36,
    amenities: ["sauna", "hamam", "ucretsiz-wifi", "resepsiyon-7-24", "restoran", "kahvalti-dahil", "cocuk-kulubu", "aile-odalari", "otopark"],
    facts: ["4 yıldızlı konak otel", "36 oda", "Çocuk kayak okulu var", "Çam ormanının içinde"],
    gallery: [
      { photo: "1605540436563-5bca919ae766", caption: "Aile pisti" },
      { photo: "1542601098-8fc114e148e2", caption: "Akşam kar yağışı" },
      { photo: "1540555700478-4be289fbecef", caption: "Hamam ve sauna" },
    ],
    rooms: [
      {
        slug: "aile-odasi", name: "Aile Odası", tagline: "40 m² — iki bölmeli",
        description: "Ebeveyn ve çocuk bölmesi ayrı; ormana bakan pencere.", sizeSqm: 40, capacityChildren: 2,
        bedConfig: "1 çift kişilik + 2 tek kişilik yatak", viewType: "Orman manzarası", photo: "1540518614846-7eded433c457",
        amenities: ["İki bölme", "Yerden ısıtma", "Su ısıtıcı"], unitCount: 10, priceMinor: 1120000, minStayNights: 2,
      },
      {
        slug: "cam-odasi", name: "Çam Odası", tagline: "24 m² — ahşap döşeme",
        description: "Ahşap döşemeli, sıcak ve sade iki kişilik oda.", sizeSqm: 24, capacityChildren: 0,
        bedConfig: "1 çift kişilik yatak", viewType: "Orman manzarası", photo: "1522771739844-6a9f6d5f14af",
        amenities: ["Yerden ısıtma", "Su ısıtıcı"], unitCount: 22, priceMinor: 740000,
      },
    ],
    highlight: {
      title: "Çocuk kayak okulu", body: "Otelin önündeki başlangıç pisti ve kayak okulu buluşma noktası.",
      tags: ["çocuk", "kayak okulu", "başlangıç pisti"], description: "Başlangıç pisti otelin önündedir; çocuk kayak okulu her sabah buradan başlar.",
      promo: ["Çocuklar için kayak dersi", "Başlangıç pisti kapıda"],
    },
  },
  {
    slug: "erciyes-kar-evi",
    name: "Erciyes Kar Evi",
    city: "Erciyes",
    address: "Tekir Kapı, Erciyes Kayak Merkezi, Kayseri",
    shortDescription: "Tekir Kapı'da, gondolun dibinde butik otel.",
    longDescription:
      "Erciyes'in Tekir Kapı girişinde 24 odalı butik otel. Gondola yürüyerek çıkılır; teras, zirveye bakar. Havalimanı kırk dakika.",
    cover: "1453306458620-5bbef13a5bca",
    starRating: 4,
    totalRooms: 24,
    amenities: ["sauna", "ucretsiz-wifi", "resepsiyon-7-24", "restoran", "bar", "kahvalti-dahil", "otopark", "havalimani-transferi"],
    facts: ["4 yıldızlı butik otel", "24 oda", "Gondol istasyonuna yürüme mesafesi", "Kayseri havalimanına yaklaşık 40 dakika"],
    gallery: [
      { photo: "1483921020237-2ff51e8e4b22", caption: "Zirveden görünüm" },
      { photo: "1520208422220-d12a3c588e6c", caption: "Rehberli dağ yürüyüşü" },
      { photo: "1551698618-1dfe5d97d256", caption: "Geniş pistler" },
    ],
    rooms: [
      {
        slug: "teras-odasi", name: "Teras Odası", tagline: "32 m² — özel teras",
        description: "Zirveye bakan özel teras ve geniş yatak.", sizeSqm: 32, capacityChildren: 1,
        bedConfig: "1 king yatak", viewType: "Dağ manzarası", photo: "1512918728675-ed5a9ecdebfd",
        amenities: ["Teras", "Minibar", "Yerden ısıtma"], unitCount: 8, priceMinor: 1340000,
      },
      {
        slug: "klasik-oda", name: "Klasik Oda", tagline: "22 m² — avlu tarafı",
        description: "Sessiz avlu tarafında iki kişilik oda.", sizeSqm: 22, capacityChildren: 0,
        bedConfig: "1 çift kişilik yatak", viewType: "Avlu manzarası", photo: "1618773928121-c32242e63f39",
        amenities: ["Yerden ısıtma", "Çalışma masası"], unitCount: 16, priceMinor: 820000,
      },
    ],
    highlight: {
      title: "Teras ve gondol yolu", body: "Zirveye bakan teras; gondol istasyonu yolun karşısında.",
      tags: ["teras", "gondol", "zirve"], description: "Terastan Erciyes zirvesi görünür; gondol istasyonu yürüme mesafesindedir.",
      promo: ["Zirve manzaralı teras", "Gondola yürüyerek"],
    },
  },
  {
    slug: "sarikamis-kristal",
    name: "Sarıkamış Kristal Otel",
    city: "Sarıkamış",
    address: "Cıbıltepe Kayak Merkezi, Sarıkamış, Kars",
    shortDescription: "Sarıçam ormanında, kristal karın ortasında.",
    longDescription:
      "Cıbıltepe'de sarıçam ormanının içinden geçen pistlerin başında. Sade odalar, bol kahvaltı ve akşamları Kars mutfağı.",
    cover: "1517299321609-52687d1bc55a",
    starRating: 3,
    totalRooms: 40,
    amenities: ["ucretsiz-wifi", "resepsiyon-7-24", "restoran", "kahvalti-dahil", "otopark", "havalimani-transferi"],
    facts: ["3 yıldızlı otel", "40 oda", "Pistler sarıçam ormanının içinden geçer", "Akşam yemeğinde Kars mutfağı"],
    gallery: [
      { photo: "1548777123-e216912df7d8", caption: "Sarıçam ormanı" },
      { photo: "1491555103944-7c647fd857e6", caption: "Zirvede mola" },
      { photo: "1422207134147-65fb81f59e38", caption: "Sıcak içecek" },
    ],
    rooms: [
      {
        slug: "orman-manzarali", name: "Orman Manzaralı Oda", tagline: "26 m² — orman tarafı",
        description: "Ormana bakan pencere, iki kişilik yatak.", sizeSqm: 26, capacityChildren: 1,
        bedConfig: "1 çift kişilik yatak", viewType: "Orman manzarası", photo: "1505693416388-ac5ce068fe85",
        amenities: ["Yerden ısıtma", "Su ısıtıcı"], unitCount: 14, priceMinor: 620000,
      },
      {
        slug: "ekonomik-oda", name: "Ekonomik Oda", tagline: "20 m² — iki tek yatak",
        description: "Kayak için gelenlere uygun, sade oda.", sizeSqm: 20, capacityChildren: 0,
        bedConfig: "2 tek kişilik yatak", viewType: "Avlu manzarası", photo: "1566665797739-1674de7a421a",
        amenities: ["Yerden ısıtma"], unitCount: 26, priceMinor: 440000,
      },
    ],
    highlight: {
      title: "Orman pisti başlangıcı", body: "Sarıçamların arasından inen pistin başlangıç noktası.",
      tags: ["pist", "orman", "sarıçam"], description: "Pistler sarıçam ormanının içinden geçer; başlangıç noktası otelin arkasındadır.",
      promo: ["Orman içi pistler", "Kristal kar"],
    },
  },
];

async function seedWinterHotels(db: ReturnType<typeof getDb>) {
  console.log("Kış tesisleri ekleniyor...");
  for (const def of WINTER_HOTELS) await seedWinterHotel(db, def);
}

async function seedWinterHotel(db: ReturnType<typeof getDb>, def: WinterHotel) {
  const hotelValues = {
    name: def.name,
    city: def.city,
    country: "Türkiye",
    shortDescription: def.shortDescription,
    longDescription: def.longDescription,
    imageUrl: winterPhoto(def.cover),
    priceLabel: null,
    aiPersona: "Yapay Zeka Rehberi",
    aiLanguage: "tr",
    seasons: ["kis"],
    starRating: def.starRating,
    totalRooms: def.totalRooms,
    checkInTime: "14:00",
    checkOutTime: "11:00",
    amenities: def.amenities,
    aiFacts: def.facts,
    aiPolicies: [
      "Giriş saati: 14:00",
      "Çıkış saati: 11:00",
      "Ücretsiz iptal: girişten 72 saat öncesine kadar",
    ],
    cancellationPolicy:
      "Girişten 72 saat öncesine kadar ücretsiz iptal. Sonrasında ilk gece ücreti tahsil edilir.",
    childPolicy: "0-6 yaş ücretsiz konaklar.",
    petsAllowed: false,
    paymentMethods: ["nakit", "kredi-karti", "havale"],
    address: def.address,
    status: "yayinda" as const,
  };
  await db
    .insert(hotelsTable)
    .values({ slug: def.slug, ...hotelValues })
    .onConflictDoUpdate({
      target: hotelsTable.slug,
      set: { ...hotelValues, updatedAt: new Date() },
    });

  const [winterHotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.slug, def.slug))
    .limit(1);
  if (!winterHotel) throw new Error(`${def.slug} kaydı oluşmadı`);

  for (const [orderIndex, room] of def.rooms.entries()) {
    const { photo, ...rest } = room;
    const values = {
      ...rest,
      imageUrl: winterPhoto(photo),
      capacityAdults: 2,
      boardType: "kahvalti-dahil",
      currency: "TRY",
      priceOnRequest: false,
      orderIndex,
    };
    await db
      .insert(roomsTable)
      .values({ ...values, hotelId: winterHotel.id })
      .onConflictDoUpdate({
        target: [roomsTable.hotelId, roomsTable.slug],
        set: { ...values, updatedAt: new Date() },
      });
  }

  // Galeri — tablo benzersiz anahtar taşımaz; idempotent kalsın diye yeniden yazılır.
  await db.delete(hotelGalleryImagesTable).where(eq(hotelGalleryImagesTable.hotelId, winterHotel.id));
  await db.insert(hotelGalleryImagesTable).values(
    def.gallery.map((item, sortOrder) => ({
      hotelId: winterHotel.id,
      url: winterPhoto(item.photo),
      caption: item.caption,
      sortOrder,
    })),
  );

  // Tur — video yerel örnek kliptir; durak metinleri tesisi anlatır.
  const suite = def.rooms[0];
  const winterSteps = [
    {
      stepId: "s1",
      title: "Lobi",
      kind: "lobby",
      body: `${def.name} resepsiyonu ve oturma alanı. Devam ettiğinizde tesisin öne çıkan noktasına geçersiniz.`,
      requiresUserContinue: true,
      media: { mode: "clip" as const, endSec: 4 },
      aiTags: ["lobi", "resepsiyon", "giriş"],
      aiDescription: "Ana lobi; resepsiyon 24 saat açık.",
      aiPromo: ["Sıcak içecek servisi"],
      branches: [
        { id: "b1", label: def.highlight.title, nextStepId: "s2" },
        { id: "b2", label: `${suite.name} — odaya git`, nextStepId: "s3" },
      ],
    },
    {
      stepId: "s2",
      title: def.highlight.title,
      kind: "amenity_spot",
      body: def.highlight.body,
      requiresUserContinue: false,
      media: { mode: "clip" as const },
      aiTags: def.highlight.tags,
      aiDescription: def.highlight.description,
      aiPromo: def.highlight.promo,
      branches: [],
    },
    {
      stepId: "s3",
      title: suite.name,
      kind: "room",
      body: `${suite.sizeSqm} m²: ${suite.description}`,
      requiresUserContinue: true,
      media: { mode: "clip" as const },
      aiTags: ["oda", suite.name.toLocaleLowerCase("tr-TR"), suite.viewType.toLocaleLowerCase("tr-TR")],
      aiDescription: `${suite.sizeSqm} m² ${suite.name}; ${suite.bedConfig}, ${suite.viewType.toLocaleLowerCase("tr-TR")}.`,
      aiPromo: suite.amenities.slice(0, 2),
      branches: [],
    },
  ];
  for (const [orderIndex, step] of winterSteps.entries()) {
    const row = {
      ...step,
      hotelSlug: def.slug,
      tourId: WINTER_TOUR_ID,
      orderIndex,
      mediaUrl: "/demo/local-sample.mp4",
      aiVisible: true,
      callouts: [],
      hotspots: [],
    };
    await db
      .insert(tourStepsTable)
      .values(row)
      .onConflictDoUpdate({
        target: [tourStepsTable.hotelSlug, tourStepsTable.tourId, tourStepsTable.stepId],
        set: row,
      });
  }

  const winterManifest = await getManifestFromDB(def.slug, WINTER_TOUR_ID);
  if (!winterManifest) throw new Error(`${def.slug} kış turu manifesti üretilemedi`);
  const now = new Date();
  const [existingTour] = await db
    .select({ id: toursTable.id })
    .from(toursTable)
    .where(and(eq(toursTable.hotelSlug, def.slug), eq(toursTable.tourId, WINTER_TOUR_ID)))
    .limit(1);
  if (existingTour) {
    await db
      .update(toursTable)
      .set({ publishedManifest: winterManifest, status: "yayinda", publishedAt: now, updatedAt: now })
      .where(eq(toursTable.id, existingTour.id));
  } else {
    await db.insert(toursTable).values({
      hotelId: winterHotel.id,
      hotelSlug: def.slug,
      tourId: WINTER_TOUR_ID,
      title: "Lobiden odaya",
      status: "yayinda",
      version: 1,
      publishedManifest: winterManifest,
      publishedAt: now,
    });
  }

  const winterSnapshot = await buildHotelContentSnapshot(db, winterHotel.id);
  await db
    .update(hotelsTable)
    .set({
      publishedSnapshot: winterSnapshot,
      publishedRevision: 1,
      status: "yayinda",
      updatedAt: new Date(),
    })
    .where(eq(hotelsTable.id, winterHotel.id));
  console.log(`  ✓ ${def.slug} (${def.rooms.length} oda, ${def.gallery.length} görsel, tur yayında)`);
}

// ---------------------------------------------------------------------------
// Operasyon demosu — Aurelia Bay için bugüne göre tarihlenen talepler ve
// rezervasyonlar. "Bugün" panosu, takvim ve liste her seed'de dolu açılır.
//
// Kurala uygun: her rezervasyon bir Dengizek talebine bağlıdır. Kayıtlar
// @seed.dengizek.dev e-postasıyla işaretlenir ve her çalıştırmada yeniden
// yazılır; elle girilmiş kayıtlara ve elle düzenlenmiş envantere dokunulmaz.
// ---------------------------------------------------------------------------
const SEED_EMAIL_DOMAIN = "@seed.dengizek.dev";

async function seedOperationsDemo(db: ReturnType<typeof getDb>, hotelId: string) {
  console.log("Operasyon demosu (talepler + rezervasyonlar) ekleniyor...");
  const today = todayIso();
  const day = (offset: number) => addDays(today, offset);
  const stamp = (offset: number, hour: number) => new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:00:00+03:00`);

  const rooms = await db
    .select({ id: roomsTable.id, slug: roomsTable.slug, unitCount: roomsTable.unitCount, priceMinor: roomsTable.priceMinor })
    .from(roomsTable)
    .where(eq(roomsTable.hotelId, hotelId));
  const room = (slug: string) => {
    const found = rooms.find((r) => r.slug === slug);
    if (!found) throw new Error(`Seed odası bulunamadı: ${slug}`);
    return found;
  };

  await db.delete(bookingsTable).where(like(bookingsTable.guestEmail, `%${SEED_EMAIL_DOMAIN}`));
  await db.delete(inquiriesTable).where(like(inquiriesTable.email, `%${SEED_EMAIL_DOMAIN}`));

  type Stay = {
    name: string;
    room: "seaview-deluxe" | "courtyard-quiet";
    from: number;
    to: number;
    status: "beklemede" | "onaylandi" | "iptal" | "no_show";
    checkedIn?: boolean;
    checkedOut?: boolean;
    adults?: number;
    children?: number;
    message: string;
  };
  const stays: Stay[] = [
    { name: "Zeynep Arslan", room: "seaview-deluxe", from: 0, to: 3, status: "onaylandi", message: "Balayı için deniz manzaralı oda rica ediyoruz." },
    { name: "Mehmet Kaya", room: "courtyard-quiet", from: 0, to: 2, status: "onaylandi", message: "Geç giriş yapacağız, saat 22 gibi." },
    { name: "Elif Demir", room: "seaview-deluxe", from: -3, to: 0, status: "onaylandi", checkedIn: true, children: 1, message: "Bebek yatağı mümkün mü?" },
    { name: "Can Yıldız", room: "courtyard-quiet", from: -1, to: 4, status: "onaylandi", checkedIn: true, message: "Sessiz bir oda tercih ederiz." },
    { name: "Ayşe Şahin", room: "seaview-deluxe", from: -2, to: 1, status: "onaylandi", checkedIn: true, message: "Kahvaltı saatleri nedir?" },
    { name: "Burak Çelik", room: "courtyard-quiet", from: -1, to: 2, status: "onaylandi", message: "Otopark var mı?" },
    { name: "Selin Aydın", room: "seaview-deluxe", from: 0, to: 2, status: "beklemede", message: "Bu akşam için yer var mı?" },
    { name: "Emre Koç", room: "seaview-deluxe", from: 6, to: 9, status: "beklemede", adults: 2, children: 1, message: "Çocuklu aileyiz, havuz ısıtmalı mı?" },
    { name: "Deniz Öztürk", room: "seaview-deluxe", from: 5, to: 8, status: "onaylandi", message: "Havalimanı transferi istiyoruz." },
    { name: "Gizem Polat", room: "courtyard-quiet", from: 9, to: 12, status: "onaylandi", message: "Uzun konaklama indirimi var mı?" },
    { name: "Okan Erdem", room: "courtyard-quiet", from: 3, to: 6, status: "onaylandi", message: "Spa paketi hakkında bilgi alabilir miyim?" },
    { name: "Merve Güneş", room: "seaview-deluxe", from: -6, to: -2, status: "onaylandi", checkedIn: true, checkedOut: true, message: "Yıl dönümü için sürpriz hazırlanabilir mi?" },
    { name: "Tolga Aksoy", room: "courtyard-quiet", from: 3, to: 5, status: "iptal", message: "Tarihlerimiz değişebilir." },
    { name: "Pınar Doğan", room: "seaview-deluxe", from: -4, to: -2, status: "no_show", message: "Hafta sonu için iki gece." },
  ];

  for (const [index, stay] of stays.entries()) {
    const email = `misafir${index + 1}${SEED_EMAIL_DOMAIN}`;
    const target = room(stay.room);
    const adults = stay.adults ?? 2;
    const children = stay.children ?? 0;
    const [inquiry] = await db
      .insert(inquiriesTable)
      .values({
        hotelId,
        hotelSlug: "aurelia-bay",
        name: stay.name,
        email,
        message: stay.message,
        checkIn: day(stay.from),
        checkOut: day(stay.to),
        adults,
        children,
        roomSlug: target.slug,
        roomId: target.id,
        source: index % 4 === 0 ? "tour_ai" : "web",
        status: "ilgileniliyor",
        createdAt: stamp(stay.from - 9, 10 + (index % 6)),
      })
      .returning();
    await db.insert(inquiryMessagesTable).values({
      inquiryId: inquiry.id,
      senderRole: "hotel",
      senderName: "Aurelia Yoneticisi",
      body: "Merhaba, talebinizi aldık. Rezervasyonunuzu oluşturduk; sorularınızı buradan yazabilirsiniz.",
      createdAt: stamp(stay.from - 8, 11),
    });
    await db.insert(bookingsTable).values({
      hotelId,
      roomId: target.id,
      inquiryId: inquiry.id,
      guestName: stay.name,
      guestEmail: email,
      checkIn: day(stay.from),
      checkOut: day(stay.to),
      adults,
      children,
      status: stay.status,
      totalMinor: (target.priceMinor ?? 0) * (stay.to - stay.from) || null,
      notes: stay.message,
      checkedInAt: stay.checkedIn ? stamp(stay.from, 15) : null,
      checkedOutAt: stay.checkedOut ? stamp(stay.to, 10) : null,
      createdAt: stamp(stay.from - 8, 12),
    });
  }
  console.log(`  ✓ ${stays.length} rezervasyon (talebe bağlı)`);

  // Henüz yanıtlanmamış / rezervasyona dönmemiş talepler
  const openInquiries = [
    { name: "Hakan Yılmaz", from: 14, to: 17, message: "Üç gece için fiyat alabilir miyim? Erken rezervasyon indirimi geçerli mi?", status: "yeni" as const },
    { name: "Seda Kurt", from: 20, to: 27, message: "Bir haftalık konaklama düşünüyoruz, her şey dahil seçeneği var mı?", status: "yeni" as const },
    { name: "Onur Şen", from: 11, to: 13, message: "Evcil hayvan kabul ediyor musunuz?", status: "kapatildi" as const },
  ];
  for (const [index, q] of openInquiries.entries()) {
    const [inquiry] = await db
      .insert(inquiriesTable)
      .values({
        hotelId,
        hotelSlug: "aurelia-bay",
        name: q.name,
        email: `talep${index + 1}${SEED_EMAIL_DOMAIN}`,
        message: q.message,
        checkIn: day(q.from),
        checkOut: day(q.to),
        adults: 2,
        children: 0,
        source: "web",
        status: q.status,
        createdAt: stamp(-index, 9),
      })
      .returning();
    if (q.status === "kapatildi") {
      await db.insert(inquiryMessagesTable).values({
        inquiryId: inquiry.id,
        senderRole: "hotel",
        senderName: "Aurelia Yoneticisi",
        body: "Merhaba, maalesef evcil hayvan kabul edemiyoruz. İlginiz için teşekkürler.",
      });
    }
  }
  console.log(`  ✓ ${openInquiries.length} açık/kapalı talep`);

  // Envanter: son 7 gün + önümüzdeki 45 gün. Kalan kontenjan = birim − o gece
  // odayı tutan seed rezervasyonu (onaylı ve gelmedi). Elle düzenlenmiş günler korunur.
  const nights = dayRange(day(-7), 52);
  for (const target of rooms) {
    const holding = stays.filter(
      (stay) => room(stay.room).id === target.id && (stay.status === "onaylandi" || stay.status === "no_show"),
    );
    await db
      .insert(roomInventoryTable)
      .values(
        nights.map((date) => ({
          hotelId,
          roomId: target.id,
          date,
          allotment:
            (target.unitCount ?? 1) -
            holding.filter((stay) => day(stay.from) <= date && date < day(stay.to)).length,
          source: "seed",
          manualOverride: false,
        })),
      )
      .onConflictDoUpdate({
        target: [roomInventoryTable.roomId, roomInventoryTable.date],
        set: { allotment: sql`excluded.allotment` },
        setWhere: eq(roomInventoryTable.source, "seed"),
      });
  }
  console.log(`  ✓ envanter (${nights[0]} → ${nights[nights.length - 1]})`);
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error("Seed hatasi:", err);
  process.exit(1);
});
