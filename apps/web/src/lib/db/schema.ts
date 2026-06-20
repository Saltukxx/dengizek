// ---------------------------------------------------------------------------
// Drizzle ORM şeması — Dengizek
// Dialect: PostgreSQL (Neon Serverless)
// ---------------------------------------------------------------------------

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

// ---------------------------------------------------------------------------
// Enum'lar — DB etiketleri ASCII tutulur (Postgres enum etiketlerinde Türkçe
// karakterden kaçınıyoruz); Türkçe görünen adlar src/lib/labels.ts'ten gelir.
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["admin", "manager"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "editor"]);
export const moderationStatusEnum = pgEnum("moderation_status", [
  "taslak",
  "incelemede",
  "yayinda",
  "reddedildi",
]);
export const mediaTypeEnum = pgEnum("media_type", ["video", "image", "vtt"]);
export const mediaStatusEnum = pgEnum("media_status", [
  "yuklendi",
  "isleniyor",
  "hazir",
  "hata",
  "yayinlandi",
]);
export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "yeni",
  "ilgileniliyor",
  "kapatildi",
]);

// ---------------------------------------------------------------------------
// users — platform kullanıcıları (admin + otel yöneticileri)
// Auth.js JWT stratejisi kullanıldığından adapter tabloları (accounts,
// sessions, verification_tokens) gerekmez; yalnızca bu tablo yeterlidir.
// ---------------------------------------------------------------------------

export const usersTable = pgTable("users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  email:        text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name:         text("name").notNull(),
  role:         userRoleEnum("role").default("manager").notNull(),
  isActive:     boolean("is_active").default(true).notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// hotels
// ---------------------------------------------------------------------------

export const hotelsTable = pgTable("hotels", {
  id:             uuid("id").defaultRandom().primaryKey(),
  slug:           text("slug").unique().notNull(),
  name:           text("name").notNull(),
  city:           text("city"),
  country:        text("country"),
  shortDescription: text("short_description"),
  longDescription:  text("long_description"),
  imageUrl:       text("image_url"),
  priceLabel:     text("price_label"),

  // AI profil
  aiPersona:   text("ai_persona").default("Yapay Zeka Rehberi").notNull(),
  aiLanguage:  text("ai_language").default("tr").notNull(),
  aiFacts:     text("ai_facts").array().default([]).notNull(),
  aiPolicies:  text("ai_policies").array().default([]).notNull(),

  // Otel özellikleri (specifications)
  starRating:   integer("star_rating"),
  totalRooms:   integer("total_rooms"),
  checkInTime:  text("check_in_time"),  // "14:00"
  checkOutTime: text("check_out_time"), // "12:00"
  // Olanak anahtarları — src/lib/amenities-catalog.ts kataloğundan (+ serbest metin)
  amenities: text("amenities").array().default([]).notNull(),

  // Politikalar (yapılandırılmış — aiPolicies serbest metninden ayrı, misafir
  // sayfasındaki "Bilmeniz Gerekenler" bölümünü ve AI gerçeklerini besler)
  cancellationPolicy: text("cancellation_policy"),
  childPolicy:        text("child_policy"),
  petsAllowed:        boolean("pets_allowed"), // null = belirtilmedi
  paymentMethods:     text("payment_methods").array().default([]).notNull(),

  // İletişim / konum
  address:           text("address"),
  phone:             text("phone"),
  contactEmail:      text("contact_email"),
  airportDistanceKm: integer("airport_distance_km"),

  // Moderasyon — misafir tarafı yalnızca "yayinda" otelleri görür
  status:         moderationStatusEnum("status").default("taslak").notNull(),
  moderationNote: text("moderation_note"),
  submittedAt:    timestamp("submitted_at"),
  reviewedAt:     timestamp("reviewed_at"),
  reviewedBy:     uuid("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// hotel_members — kullanıcı ↔ otel üyeliği (çoklu kullanıcı / çoklu otel)
// ---------------------------------------------------------------------------

export const hotelMembersTable = pgTable("hotel_members", {
  id:        uuid("id").defaultRandom().primaryKey(),
  userId:    uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  hotelId:   uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  role:      memberRoleEnum("role").default("editor").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userHotelUnique: uniqueIndex("hotel_members_user_hotel_unique").on(table.userId, table.hotelId),
  hotelIdx:        index("hotel_members_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// tours — tur üst kaydı + yayın anlık görüntüsü (snapshot)
// tour_steps her zaman "çalışma kopyası"dır; admin onayında manifest
// publishedManifest alanına dondurulur ve misafir oynatıcı yalnızca onu okur.
// ---------------------------------------------------------------------------

export const toursTable = pgTable("tours", {
  id:        uuid("id").defaultRandom().primaryKey(),
  hotelId:   uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  // tour_steps.hotel_slug ile uyum için denormalize — slug değiştirilemez kuralı geçerli
  hotelSlug: text("hotel_slug").notNull(),
  tourId:    text("tour_id").notNull(),
  title:     text("title").notNull(),

  status:         moderationStatusEnum("status").default("taslak").notNull(),
  moderationNote: text("moderation_note"),
  version:        integer("version").default(1).notNull(),
  publishedManifest: jsonb("published_manifest").$type<TourManifest>(),
  publishedAt: timestamp("published_at"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt:  timestamp("reviewed_at"),
  reviewedBy:  uuid("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hotelTourUnique: uniqueIndex("tours_hotel_slug_tour_unique").on(table.hotelSlug, table.tourId),
}));

// ---------------------------------------------------------------------------
// tour_steps
// ---------------------------------------------------------------------------

export const tourStepsTable = pgTable("tour_steps", {
  id:        uuid("id").defaultRandom().primaryKey(),
  hotelSlug: text("hotel_slug").notNull().references(() => hotelsTable.slug, { onDelete: "cascade" }),
  tourId:    text("tour_id").notNull(),
  stepId:    text("step_id").notNull(),
  title:     text("title").notNull(),
  kind:      text("kind").notNull(), // "lobby" | "corridor" | "room" | "amenity_spot"
  orderIndex: integer("order_index").notNull(),
  requiresUserContinue: boolean("requires_user_continue").default(false).notNull(),
  body:      text("body"),

  // Medya
  mediaUrl: text("media_url").notNull(),
  media: jsonb("media").$type<{
    mode: "clip" | "window";
    startSec?: number;
    endSec?: number;
  }>().notNull(),

  captionsVttUrl: text("captions_vtt_url"),
  narrationUrl:   text("narration_url"),
  stepKey:        text("step_key"),

  // Tur yapısı — JSONB dizileri
  branches: jsonb("branches").$type<{
    id: string; label: string; nextStepId: string;
  }[]>().default([]).notNull(),

  callouts: jsonb("callouts").$type<{
    id: string; tSec: number; title: string; body?: string; placement?: string;
  }[]>().default([]).notNull(),

  hotspots: jsonb("hotspots").$type<{
    id: string; xPct: number; yPct: number; label: string; body?: string; tSec?: number;
  }[]>().default([]).notNull(),

  // AI metadata
  aiTags:        text("ai_tags").array().default([]).notNull(),
  aiDescription: text("ai_description"),
  aiPromo:       text("ai_promo").array().default([]).notNull(),
  aiVisible:     boolean("ai_visible").default(true).notNull(),
}, (table) => ({
  hotelTourIdx: index("hotel_tour_idx").on(table.hotelSlug, table.tourId),
  // Upsert hedefi — seed ve adım editörü onConflictDoUpdate için zorunlu
  hotelTourStepUnique: uniqueIndex("tour_steps_hotel_tour_step_unique").on(
    table.hotelSlug, table.tourId, table.stepId,
  ),
}));

// ---------------------------------------------------------------------------
// rooms — oda tipleri
// Fiyat: priceMinor en küçük birimde (kuruş/cent) tutulur; priceOnRequest
// true ise fiyat gösterilmez, "Talep üzerine" yazılır.
// ---------------------------------------------------------------------------

export const roomsTable = pgTable("rooms", {
  id:      uuid("id").defaultRandom().primaryKey(),
  hotelId: uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  slug:    text("slug").notNull(), // /hotels/[slug]/rooms/[roomSlug]
  name:    text("name").notNull(),
  tagline: text("tagline"),
  description: text("description"),

  sizeSqm:          integer("size_sqm"),
  capacityAdults:   integer("capacity_adults").default(2).notNull(),
  capacityChildren: integer("capacity_children").default(0).notNull(),
  bedConfig: text("bed_config"), // "1 king + 1 çekyat"
  viewType:  text("view_type"),  // "Deniz manzarası"
  imageUrl:  text("image_url"),
  amenities: text("amenities").array().default([]).notNull(), // oda olanakları

  // Konaklama koşulları
  boardType:     text("board_type").default("sadece-oda").notNull(), // sadece-oda | kahvalti-dahil | yarim-pansiyon | tam-pansiyon | hersey-dahil
  unitCount:     integer("unit_count"),       // bu tipten kaç oda var
  minStayNights: integer("min_stay_nights"),  // varsayılan min gece (dönem bazlı olan ezer)
  pricingNotes:  text("pricing_notes"),       // "3. kişi +₺800, 0–6 yaş ücretsiz"

  // Baz fiyat — bir room_rates dönemi bugüne denk geliyorsa dönem fiyatı kazanır
  priceMinor:     integer("price_minor"),
  currency:       text("currency").default("TRY").notNull(),
  priceOnRequest: boolean("price_on_request").default(true).notNull(),

  // Basit iskonto — üstü çizili fiyat gösterimi (baz veya dönem fiyatına uygulanır)
  discountPercent: integer("discount_percent"), // 1-90
  discountLabel:   text("discount_label"),      // "Erken rezervasyona özel"

  isActive:   boolean("is_active").default(true).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hotelSlugUnique: uniqueIndex("rooms_hotel_slug_unique").on(table.hotelId, table.slug),
  hotelIdx:        index("rooms_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// room_rates — dönemsel oda fiyatları (sezon takvimi)
// Çakışan tarih aralıklarına izin verilir (genel sezon + bayram istisnası
// pratiği); çözüm kuralı: başlangıcı en geç olan dönem kazanır.
// Dönem kaydında "talep üzerine" yok — dönem girildiyse fiyat zorunludur.
// ---------------------------------------------------------------------------

export const roomRatesTable = pgTable("room_rates", {
  id:      uuid("id").defaultRandom().primaryKey(),
  roomId:  uuid("room_id").notNull().references(() => roomsTable.id, { onDelete: "cascade" }),
  // Tenant guard sorguları için denormalize
  hotelId: uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  name:    text("name").notNull(), // "Yaz 2026", "Kurban Bayramı"

  startDate: date("start_date").notNull(), // YYYY-MM-DD
  endDate:   date("end_date").notNull(),

  priceMinor:    integer("price_minor").notNull(),
  currency:      text("currency").default("TRY").notNull(),
  minStayNights: integer("min_stay_nights"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roomStartIdx: index("room_rates_room_start_idx").on(table.roomId, table.startDate),
  hotelIdx:     index("room_rates_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// restaurants — restoranlar + menü (jsonb)
// Menü tek satırda jsonb tutulur: neon-http transaction desteklemediği için
// bölüm/öğe düzenlemeleri tek atomik UPDATE ile kaydedilir.
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  priceMinor?: number | null;
  currency: string;
  priceOnRequest: boolean;
  tags: string[]; // "vejetaryen" | "vegan" | "glutensiz" | "acili"
}

export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
}

export const restaurantsTable = pgTable("restaurants", {
  id:      uuid("id").defaultRandom().primaryKey(),
  hotelId: uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  name:    text("name").notNull(),
  description: text("description"),
  cuisine:  text("cuisine"),  // "Akdeniz mutfağı"
  hours:    text("hours"),    // "07:00 - 23:00"
  location: text("location"), // "Lobi katı, deniz tarafı"
  imageUrl: text("image_url"),

  menu: jsonb("menu").$type<MenuSection[]>().default([]).notNull(),

  isActive:   boolean("is_active").default(true).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hotelIdx: index("restaurants_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// extras — ücretli ek hizmetler (transfer, spa paketi, romantik akşam...)
// ---------------------------------------------------------------------------

export const extrasTable = pgTable("extras", {
  id:      uuid("id").defaultRandom().primaryKey(),
  hotelId: uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  name:    text("name").notNull(),
  description: text("description"),
  category:  text("category").default("diger").notNull(), // transfer | spa | romantik | aktivite | diger
  unitLabel: text("unit_label"), // "kişi başı", "gecelik"
  imageUrl:  text("image_url"),

  priceMinor:     integer("price_minor"),
  currency:       text("currency").default("TRY").notNull(),
  priceOnRequest: boolean("price_on_request").default(true).notNull(),

  // Basit iskonto — odalardaki kalıpla aynı
  discountPercent: integer("discount_percent"),
  discountLabel:   text("discount_label"),

  isActive:   boolean("is_active").default(true).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hotelIdx: index("extras_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// media_assets — Bunny Stream medya varlıkları
// Durum akışı: yuklendi → isleniyor → hazir | hata → yayinlandi
// ---------------------------------------------------------------------------

export const mediaAssetsTable = pgTable("media_assets", {
  id:      uuid("id").defaultRandom().primaryKey(),
  hotelId: uuid("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  type:    mediaTypeEnum("type").notNull(),
  status:  mediaStatusEnum("status").default("yuklendi").notNull(),
  title:   text("title").notNull(),

  bunnyVideoGuid: text("bunny_video_guid").unique(),
  playbackUrl:    text("playback_url"),   // HLS: https://{CDN}/{guid}/playlist.m3u8
  thumbnailUrl:   text("thumbnail_url"),
  durationSec:    integer("duration_sec"),
  sizeBytes:      integer("size_bytes"),
  errorMessage:   text("error_message"),

  createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hotelIdx: index("media_assets_hotel_idx").on(table.hotelId),
}));

// ---------------------------------------------------------------------------
// inquiries — misafir talepleri (alanlar inquiryFormSchema ile birebir)
// ---------------------------------------------------------------------------

export const inquiriesTable = pgTable("inquiries", {
  id:        uuid("id").defaultRandom().primaryKey(),
  hotelId:   uuid("hotel_id").references(() => hotelsTable.id, { onDelete: "set null" }),
  hotelSlug: text("hotel_slug"),

  name:             text("name").notNull(),
  email:            text("email").notNull(),
  phone:            text("phone"),
  message:          text("message").notNull(),
  marketingConsent: boolean("marketing_consent").default(false).notNull(),

  status:    inquiryStatusEnum("status").default("yeni").notNull(),
  handledBy: uuid("handled_by").references(() => usersTable.id, { onDelete: "set null" }),
  handledAt: timestamp("handled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  hotelStatusIdx: index("inquiries_hotel_status_idx").on(table.hotelId, table.status),
}));

// ---------------------------------------------------------------------------
// audit_log — admin ve kritik yönetici işlemlerinin denetim kaydı
// action: nokta-ayrımlı ASCII anahtar ("otel.onaylandi", "tur.reddedildi" vb.)
// ---------------------------------------------------------------------------

export const auditLogTable = pgTable("audit_log", {
  id:         uuid("id").defaultRandom().primaryKey(),
  actorId:    uuid("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email"), // kullanıcı silinse de iz kalsın
  action:     text("action").notNull(),
  entityType: text("entity_type").notNull(), // "hotel" | "tour" | "user" | "media" | "inquiry"
  entityId:   text("entity_id").notNull(),
  meta:       jsonb("meta").$type<Record<string, unknown>>(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx:    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// Tip dışa aktarımları
// ---------------------------------------------------------------------------

export type Hotel       = typeof hotelsTable.$inferSelect;
export type TourStep    = typeof tourStepsTable.$inferSelect;
export type Room        = typeof roomsTable.$inferSelect;
export type RoomRate    = typeof roomRatesTable.$inferSelect;
export type Restaurant  = typeof restaurantsTable.$inferSelect;
export type Extra       = typeof extrasTable.$inferSelect;
export type User        = typeof usersTable.$inferSelect;
export type HotelMember = typeof hotelMembersTable.$inferSelect;
export type Tour        = typeof toursTable.$inferSelect;
export type MediaAsset  = typeof mediaAssetsTable.$inferSelect;
export type Inquiry     = typeof inquiriesTable.$inferSelect;
export type AuditLog    = typeof auditLogTable.$inferSelect;

export type ModerationStatus = (typeof moderationStatusEnum.enumValues)[number];
export type MediaStatus      = (typeof mediaStatusEnum.enumValues)[number];
export type InquiryStatus    = (typeof inquiryStatusEnum.enumValues)[number];
export type UserRole         = (typeof userRoleEnum.enumValues)[number];
export type MemberRole       = (typeof memberRoleEnum.enumValues)[number];
