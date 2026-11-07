import { z } from "zod";
import { datePattern } from "./hotel-content";
import { eachStayNight, validateStayDates } from "@/lib/stay-dates";
import { redactContactInfo } from "@/lib/contact-guard";

const uuid = z.string().uuid();

/**
 * PATCH şeması: bütün alanlar isteğe bağlı ve VARSAYILANSIZ. Zod'un
 * `.partial()`'ı `.default()` değerlerini korur; gönderilmeyen alan
 * varsayılanıyla doldurulup kayda yazılıyordu (ör. kampanyayı "Durdur"
 * roomIds'i [] yapıp kampanyayı bütün odalara yayıyordu; varsayılan plan
 * anahtarı planı "iade edilebilir"e çeviriyordu).
 */
function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.removeDefault() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof S]: z.ZodOptional<S[K]> }>;
}

const imageUrl = z.string().min(1).refine(
  (v) => v.startsWith("/") || /^https?:\/\//.test(v),
  "Geçerli bir görsel adresi girin",
);

export const galleryImageSchema = z.object({
  url: imageUrl,
  objectKey: z.string().regex(/^hotels\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp|gif)$/).optional(),
  caption: z.string().max(300).optional(),
  roomId: uuid.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const galleryPatchSchema = galleryImageSchema.partial().extend({
  id: uuid,
});

const availabilityNoteBaseSchema = z.object({
  label: z.string().min(1).max(200),
  startDate: z.string().regex(datePattern).nullable().optional(),
  endDate: z.string().regex(datePattern).nullable().optional(),
  isBlackout: z.boolean().default(false),
});
export const availabilityNoteSchema = availabilityNoteBaseSchema.refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: "Bitiş tarihi başlangıçtan önce olamaz.", path: ["endDate"] });

export const availabilityNotePatchSchema = patchOf(availabilityNoteBaseSchema).extend({
  id: uuid,
});

export const cancellationRuleSchema = z.object({
  name: z.string().min(1).max(120),
  freeUntilDaysBefore: z.number().int().min(0).max(365).nullable().optional(),
  penaltyPercent: z.number().int().min(0).max(100).nullable().optional(),
  depositPercent: z.number().int().min(0).max(100).nullable().optional(),
  customText: z.string().max(2000).optional(),
});

export const cancellationRulePatchSchema = cancellationRuleSchema.partial().extend({
  id: uuid,
});

export const ratePlanSchema = z.object({
  name: z.string().min(1).max(120),
  isRefundable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  boardTypeOverride: z.string().max(40).nullable().optional(),
  cancellationRuleId: uuid.nullable().optional(),
});

export const ratePlanPatchSchema = patchOf(ratePlanSchema).extend({
  id: uuid,
});

const ratePlanPriceBaseSchema = z.object({
  roomId: uuid,
  name: z.string().min(1).max(120),
  startDate: z.string().regex(datePattern),
  endDate: z.string().regex(datePattern),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).default("TRY"),
  minStayNights: z.number().int().positive().nullable().optional(),
  // Kişi sayısına göre gecelik fiyat — dönemsel fiyatlarla (room_rates) aynı kalıp.
  occupancyPrices: z
    .array(z.object({
      guestCount: z.number().int().min(1).max(12),
      priceMinor: z.number().int().nonnegative(),
    }))
    .max(15)
    .optional()
    .default([]),
});
export const ratePlanPriceSchema = ratePlanPriceBaseSchema
  .refine((v) => v.endDate >= v.startDate, { message: "Bitiş tarihi başlangıçtan önce olamaz.", path: ["endDate"] })
  .refine(
    (v) => {
      const counts = (v.occupancyPrices ?? []).map((p) => p.guestCount);
      return new Set(counts).size === counts.length;
    },
    { message: "Aynı kişi sayısı için birden fazla fiyat olamaz.", path: ["occupancyPrices"] },
  );

export const ratePlanPricePatchSchema = patchOf(ratePlanPriceBaseSchema).extend({
  id: uuid,
});

const stayPayTierSchema = z
  .object({ stay: z.number().int().min(2).max(30), pay: z.number().int().min(1).max(29) })
  .refine((t) => t.pay < t.stay, { message: "Ödenen gece kalınan geceden az olmalı.", path: ["pay"] });

const promotionBaseSchema = z.object({
  name: z.string().min(1).max(120),
  /** Yüzde indirim; kal-öde kampanyasında boş bırakılır. */
  discountPercent: z.number().int().min(1).max(90).nullable().optional(),
  /** "X kal Y öde" basamakları; doluysa kampanya konaklamanın tamamına uygulanır. */
  stayPayTiers: z.array(stayPayTierSchema).max(10).default([]),
  freeNightRule: z.enum(["hafta_ici", "en_ucuz"]).nullable().optional(),
  validFrom: z.string().regex(datePattern).nullable().optional(),
  validTo: z.string().regex(datePattern).nullable().optional(),
  minNights: z.number().int().positive().nullable().optional(),
  /** Konaklama en fazla bu kadar geceyse (ör. "2 ve 3 gece" → min 2, max 3). */
  maxNights: z.number().int().positive().max(60).nullable().optional(),
  /** Rezervasyon tarihi aralığı (erken rezervasyon / son rezervasyon). */
  bookableFrom: z.string().regex(datePattern).nullable().optional(),
  bookableTo: z.string().regex(datePattern).nullable().optional(),
  /** Oda tipi başına gecelik kampanya kontenjanı. */
  allotment: z.number().int().min(1).max(10_000).nullable().optional(),
  roomIds: z.array(uuid).default([]),
  isActive: z.boolean().default(true),
});
export const promotionSchema = promotionBaseSchema
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, { message: "Bitiş tarihi başlangıçtan önce olamaz.", path: ["validTo"] })
  .refine((v) => v.minNights == null || v.maxNights == null || v.minNights <= v.maxNights, {
    message: "En az gece en fazla geceden büyük olamaz.",
    path: ["maxNights"],
  })
  .refine((v) => !v.bookableFrom || !v.bookableTo || v.bookableTo >= v.bookableFrom, {
    message: "Son rezervasyon tarihi ilk rezervasyon tarihinden önce olamaz.",
    path: ["bookableTo"],
  })
  .refine((v) => (v.discountPercent != null) !== (v.stayPayTiers.length > 0), {
    message: "Kampanya ya yüzde indirim ya da kal-öde basamakları içermeli (ikisi birden değil).",
    path: ["discountPercent"],
  });

export const promotionPatchSchema = patchOf(promotionBaseSchema).extend({
  id: uuid,
});

/** Serbest metin: iletişim bilgisi kayda girmeden maskelenir (bkz. contact-guard). */
const guardedText = (min: number, max: number) =>
  z.string().min(min).max(max).transform(redactContactInfo);

export const inquiryMessageSchema = z.object({
  body: guardedText(1, 5000),
  senderName: guardedText(0, 120).optional(),
});

// Otel panelinden girilen yorum. `source` KASITLI olarak yok — otelin kendi
// girdiği yorum "verified_guest" olarak etiketlenemez; doğrulanmış yorum
// yalnızca misafirin portal token'ıyla yazdığı yorumdur (bkz.
// /api/inquiry/portal/[token]/review).
export const reviewCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: guardedText(0, 200).optional(),
  body: guardedText(1, 5000),
  guestName: guardedText(1, 120),
  stayDate: z.string().regex(datePattern).nullable().optional(),
  inquiryId: uuid.nullable().optional(),
  bookingId: uuid.nullable().optional(),
});

/** Misafirin talep portalından bıraktığı yorum — kimlik token'dan gelir. */
export const guestReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: guardedText(0, 200).optional(),
  body: guardedText(1, 5000),
  stayDate: z.string().regex(datePattern).nullable().optional(),
});

export const reviewPatchSchema = z.object({
  id: uuid,
  reply: guardedText(0, 5000).optional(),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["yayinda", "reddedildi"]),
});

// Rezervasyon yalnız Otelsayfam üzerinden gelen bir talepten açılır: inquiryId
// zorunludur ve misafir adı/iletişimi istemciden ALINMAZ — sunucu talep
// kaydından okur. Otel panelinden dışarıdan misafir girişi yapılamaz.
// integer sütun sınırı (2^31-1) ve gece başına envanter yazımı için üst sınırlar.
const MAX_GUESTS = 50;
const MAX_TOTAL_MINOR = 2_000_000_000;
const MAX_STAY_NIGHTS = 365;

export const bookingCreateSchema = z
  .object({
    inquiryId: uuid,
    roomId: uuid.nullable().optional(),
    ratePlanId: uuid.nullable().optional(),
    checkIn: z.string().regex(datePattern),
    checkOut: z.string().regex(datePattern),
    adults: z.number().int().min(1).max(MAX_GUESTS).default(2),
    children: z.number().int().min(0).max(MAX_GUESTS).default(0),
    totalMinor: z.number().int().nonnegative().max(MAX_TOTAL_MINOR).nullable().optional(),
    currency: z.string().length(3).default("TRY"),
    notes: z.string().max(2000).optional(),
    /** Uygulanan kampanya — kampanya kontenjanından düşer. */
    promotionId: uuid.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const dates = validateStayDates(data.checkIn, data.checkOut);
    if (!dates.ok) {
      ctx.addIssue({ code: "custom", message: dates.error, path: ["checkOut"] });
    } else if (eachStayNight(data.checkIn, data.checkOut).length > MAX_STAY_NIGHTS) {
      ctx.addIssue({
        code: "custom",
        message: `Konaklama en fazla ${MAX_STAY_NIGHTS} gece olabilir.`,
        path: ["checkOut"],
      });
    }
  });

export const bookingPatchSchema = z.object({
  id: uuid,
  action: z.enum(["approve", "cancel", "mark_no_show", "reopen", "check_in", "check_out", "undo_check_in", "undo_check_out"]).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
  notes: z.string().max(2000).optional(),
  totalMinor: z.number().int().nonnegative().max(MAX_TOTAL_MINOR).nullable().optional(),
}).refine((value) => !value.action || Boolean(value.idempotencyKey), { message: "Durum değişikliği için idempotencyKey gerekli.", path: ["idempotencyKey"] });

export const inventoryEntrySchema = z.object({
  roomId: uuid,
  date: z.string().regex(datePattern),
  allotment: z.number().int().min(0).max(10_000),
  stopSell: z.boolean().default(false),
  minStay: z.number().int().positive().max(365).nullable().optional(),
  cta: z.boolean().default(false),
  ctd: z.boolean().default(false),
});

export const inventoryPutSchema = z.object({
  entries: z.array(inventoryEntrySchema).min(1).max(500),
});

// Tutar/para birimi kasıtlı olarak yok — sunucu rezervasyon kaydından okur.
export const paymentIntentSchema = z.object({
  bookingId: uuid,
});

export const icalFeedSchema = z.object({
  name: z.string().min(1).max(120),
  importUrl: z.string().url().max(2000).regex(/^https?:\/\//i, "Adres http(s) ile başlamalıdır.").nullable().optional(),
  // İçe aktarılan meşguliyetin yazılacağı oda — importUrl varsa zorunlu.
  roomId: uuid.nullable().optional(),
});

export const icalFeedPatchSchema = icalFeedSchema.partial().extend({
  id: uuid,
});

export const hotelMemberAddSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "editor"]).default("editor"),
});

export const hotelMemberRemoveSchema = z.object({
  userId: uuid,
});

export const notificationPatchSchema = z.object({
  ids: z.array(uuid).min(1),
  read: z.boolean(),
});

export const reorderSchema = z.object({
  sirali: z.array(uuid).min(1),
});
