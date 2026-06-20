import { z } from "zod";
import { validateLatLng } from "@/lib/stay-dates";
import { currencies } from "@/lib/price";

// ---------------------------------------------------------------------------
// Otel içerik şemaları — odalar, restoranlar (menü), ekstralar, özellikler
// ---------------------------------------------------------------------------

/** URL kimliği: küçük harf, rakam ve tire */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// ---------------------------------------------------------------------------
// Pansiyon tipleri ve ödeme yöntemleri — Türkçe etiket sözlükleri
// ---------------------------------------------------------------------------

export const boardTypes = [
  "sadece-oda",
  "kahvalti-dahil",
  "yarim-pansiyon",
  "tam-pansiyon",
  "hersey-dahil",
] as const;

export const boardTypeLabels: Record<(typeof boardTypes)[number], string> = {
  "sadece-oda": "Sadece oda",
  "kahvalti-dahil": "Kahvaltı dahil",
  "yarim-pansiyon": "Yarım pansiyon",
  "tam-pansiyon": "Tam pansiyon",
  "hersey-dahil": "Her şey dahil",
};

export const paymentMethods = ["nakit", "kredi-karti", "havale", "online"] as const;

export const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  nakit: "Nakit",
  "kredi-karti": "Kredi kartı",
  havale: "Havale / EFT",
  online: "Online ödeme",
};

/** Ortak fiyat alanları — priceOnRequest=false ise tutar zorunlu */
export const priceFieldsSchema = z.object({
  priceMinor: z
    .number()
    .int()
    .nonnegative("Fiyat negatif olamaz")
    .max(1_000_000_000)
    .nullable()
    .optional(),
  currency: z.enum(currencies).default("TRY"),
  priceOnRequest: z.boolean().default(true),
});

function requirePriceWhenNotOnRequest<
  T extends { priceOnRequest: boolean; priceMinor?: number | null },
>(v: T): boolean {
  return v.priceOnRequest || (v.priceMinor !== null && v.priceMinor !== undefined);
}

const priceRefineOptions = {
  message: "Fiyat girin veya 'Talep üzerine' seçeneğini işaretleyin.",
  path: ["priceMinor"] as (string | number)[],
};

// ---------------------------------------------------------------------------
// Oda
// ---------------------------------------------------------------------------

export const roomUpsertSchema = priceFieldsSchema
  .extend({
    slug: z
      .string()
      .min(2, "Oda kimliği en az 2 karakter olmalı")
      .max(64)
      .regex(slugPattern, "Oda kimliği yalnızca küçük harf, rakam ve tire içerebilir"),
    name: z.string().min(1, "Oda adı gerekli").max(200),
    tagline: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    sizeSqm: z.number().int().positive("Alan pozitif olmalı").max(10000).nullable().optional(),
    capacityAdults: z.number().int().min(1, "En az 1 yetişkin").max(20).default(2),
    capacityChildren: z.number().int().min(0).max(20).default(0),
    bedConfig: z.string().max(200).optional(),
    viewType: z.string().max(120).optional(),
    imageUrl: z.string().url("Geçerli bir görsel adresi girin").optional().or(z.literal("")),
    galleryUrls: z.array(z.string().url()).max(20).optional(),
    amenities: z.array(z.string().min(1).max(120)).max(50, "En fazla 50 olanak").default([]),
    boardType: z.enum(boardTypes).default("sadece-oda"),
    unitCount: z
      .number()
      .int()
      .positive("Oda adedi pozitif olmalı")
      .max(10000)
      .nullable()
      .optional(),
    minStayNights: z.number().int().min(1).max(30).nullable().optional(),
    pricingNotes: z.string().max(500, "Fiyat notu en fazla 500 karakter olabilir").optional(),
    discountPercent: z
      .number()
      .int()
      .min(1, "İndirim %1-90 arası olmalı")
      .max(90, "İndirim %1-90 arası olmalı")
      .nullable()
      .optional(),
    discountLabel: z.string().max(120).optional(),
    isActive: z.boolean().default(true),
  })
  .refine(requirePriceWhenNotOnRequest, priceRefineOptions)
  .refine((v) => !v.discountPercent || !v.priceOnRequest, {
    message: "İndirim için önce fiyat girin.",
    path: ["discountPercent"],
  });

export type RoomUpsertValues = z.infer<typeof roomUpsertSchema>;

export const roomsReorderSchema = z.object({
  sirali: z.array(z.string().uuid()).min(1, "Sıralama listesi boş olamaz").max(200),
});

// ---------------------------------------------------------------------------
// Dönemsel fiyatlar — PUT ile tüm liste tek seferde kaydedilir
// ---------------------------------------------------------------------------

export const occupancyPriceSchema = z.object({
  guestCount: z.number().int().min(1, "En az 1 kişi").max(20, "En fazla 20 kişi"),
  priceMinor: z
    .number()
    .int()
    .positive("Kişi fiyatı pozitif olmalı")
    .max(1_000_000_000),
});

const roomRateFieldsSchema = z.object({
  id: z.string().uuid().optional(), // varsa update, yoksa insert
  name: z.string().min(1, "Dönem adı gerekli").max(120),
  startDate: z
    .string()
    .regex(datePattern, "Tarih YYYY-AA-GG biçiminde olmalı (örn. 2026-06-01)"),
  endDate: z
    .string()
    .regex(datePattern, "Tarih YYYY-AA-GG biçiminde olmalı (örn. 2026-09-15)"),
  priceMinor: z
    .number()
    .int()
    .positive("Dönem fiyatı pozitif olmalı")
    .max(1_000_000_000),
  currency: z.enum(currencies).default("TRY"),
  minStayNights: z.number().int().min(1).max(30).nullable().optional(),
  occupancyPrices: z.array(occupancyPriceSchema).max(15).optional().default([]),
});

const roomRateDateRefine = {
  message: "Bitiş tarihi başlangıçtan önce olamaz.",
  path: ["endDate"],
};

function uniqueOccupancyGuestCounts(
  v: { occupancyPrices?: { guestCount: number }[] | null },
  ctx: z.RefinementCtx,
) {
  const counts = (v.occupancyPrices ?? []).map((p) => p.guestCount);
  if (new Set(counts).size !== counts.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Aynı kişi sayısı için birden fazla fiyat olamaz.",
      path: ["occupancyPrices"],
    });
  }
}

export const roomRateSchema = roomRateFieldsSchema
  .superRefine(uniqueOccupancyGuestCounts)
  .refine((v) => v.startDate <= v.endDate, roomRateDateRefine);

export const roomRateInsertSchema = roomRateFieldsSchema
  .omit({ id: true })
  .superRefine(uniqueOccupancyGuestCounts)
  .refine((v) => v.startDate <= v.endDate, roomRateDateRefine);

export const roomRatesPutSchema = z.object({
  donemler: z.array(roomRateSchema).max(40, "Oda başına en fazla 40 dönem"),
});

export const seasonalRatesRoomSyncSchema = z.object({
  roomId: z.string().uuid(),
  donemler: z.array(roomRateSchema).max(40, "Oda başına en fazla 40 dönem"),
});

export const seasonalRatesBulkPutSchema = z.object({
  rooms: z.array(seasonalRatesRoomSyncSchema).min(1).max(100),
});

export const seasonalRatesBulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(200),
  }),
  z.object({
    action: z.literal("apply"),
    roomIds: z.array(z.string().uuid()).min(1).max(100),
    period: roomRateInsertSchema,
  }),
]);

export type RoomRateValues = z.infer<typeof roomRateSchema>;

// ---------------------------------------------------------------------------
// Restoran + menü
// ---------------------------------------------------------------------------

export const menuItemSchema = priceFieldsSchema
  .extend({
    id: z.string().min(1),
    name: z.string().min(1, "Ürün adı gerekli").max(200),
    description: z.string().max(500).optional(),
    tags: z
      .array(z.enum(["vejetaryen", "vegan", "glutensiz", "acili"]))
      .max(4)
      .default([]),
  })
  .refine(requirePriceWhenNotOnRequest, priceRefineOptions);

export const menuSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Bölüm başlığı gerekli").max(200),
  items: z.array(menuItemSchema).max(50, "Bölüm başına en fazla 50 ürün"),
});

export const restaurantUpsertSchema = z.object({
  name: z.string().min(1, "Restoran adı gerekli").max(200),
  description: z.string().max(2000).optional(),
  cuisine: z.string().max(120).optional(),
  hours: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  imageUrl: z.string().url("Geçerli bir görsel adresi girin").optional().or(z.literal("")),
  menu: z.array(menuSectionSchema).max(20, "En fazla 20 menü bölümü").default([]),
  isActive: z.boolean().default(true),
});

export type RestaurantUpsertValues = z.infer<typeof restaurantUpsertSchema>;

// ---------------------------------------------------------------------------
// Ekstra
// ---------------------------------------------------------------------------

export const extraCategories = ["transfer", "spa", "romantik", "aktivite", "diger"] as const;

export const extraCategoryLabels: Record<(typeof extraCategories)[number], string> = {
  transfer: "Transfer",
  spa: "Spa & Sağlık",
  romantik: "Romantik",
  aktivite: "Aktivite",
  diger: "Diğer",
};

export const extraUpsertSchema = priceFieldsSchema
  .extend({
    name: z.string().min(1, "Hizmet adı gerekli").max(200),
    description: z.string().max(2000).optional(),
    category: z.enum(extraCategories).default("diger"),
    unitLabel: z.string().max(120).optional(),
    imageUrl: z.string().url("Geçerli bir görsel adresi girin").optional().or(z.literal("")),
    discountPercent: z
      .number()
      .int()
      .min(1, "İndirim %1-90 arası olmalı")
      .max(90, "İndirim %1-90 arası olmalı")
      .nullable()
      .optional(),
    discountLabel: z.string().max(120).optional(),
    isActive: z.boolean().default(true),
  })
  .refine(requirePriceWhenNotOnRequest, priceRefineOptions)
  .refine((v) => !v.discountPercent || !v.priceOnRequest, {
    message: "İndirim için önce fiyat girin.",
    path: ["discountPercent"],
  });

export type ExtraUpsertValues = z.infer<typeof extraUpsertSchema>;

// ---------------------------------------------------------------------------
// Otel özellikleri (hotelUpdateSchema'ya eklenecek parça)
// ---------------------------------------------------------------------------

export const hotelSpecsSchema = z.object({
  starRating: z
    .number()
    .int()
    .min(1, "Yıldız 1-5 arası olmalı")
    .max(5, "Yıldız 1-5 arası olmalı")
    .nullable()
    .optional(),
  totalRooms: z.number().int().positive().max(10000).nullable().optional(),
  checkInTime: z
    .string()
    .regex(timePattern, "Saat SS:DD biçiminde olmalı (örn. 14:00)")
    .optional()
    .or(z.literal("")),
  checkOutTime: z
    .string()
    .regex(timePattern, "Saat SS:DD biçiminde olmalı (örn. 12:00)")
    .optional()
    .or(z.literal("")),
  amenities: z.array(z.string().min(1).max(120)).max(100, "En fazla 100 olanak").optional(),

  // Politikalar
  cancellationPolicy: z.string().max(2000, "İptal politikası en fazla 2000 karakter").optional(),
  childPolicy: z.string().max(2000, "Çocuk politikası en fazla 2000 karakter").optional(),
  petsAllowed: z.boolean().nullable().optional(),
  paymentMethods: z.array(z.enum(paymentMethods)).max(10).optional(),

  // İletişim / konum
  address: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
  contactEmail: z.string().email("Geçerli bir e-posta girin").optional().or(z.literal("")),
  airportDistanceKm: z.number().int().min(0).max(500).nullable().optional(),
  latitude: z.string().max(30).optional().or(z.literal("")),
  longitude: z.string().max(30).optional().or(z.literal("")),
  propertyType: z.enum(["otel", "apart", "villa", "butik", "pansiyon", "diger"]).optional(),
  blackoutText: z.string().max(2000).optional(),
  cancellationRuleId: z.string().uuid().nullable().optional(),
}).superRefine((data, ctx) => {
  const coords = validateLatLng(data.latitude, data.longitude);
  if (!coords.ok) {
    ctx.addIssue({ code: "custom", message: coords.error, path: ["latitude"] });
  }
});
