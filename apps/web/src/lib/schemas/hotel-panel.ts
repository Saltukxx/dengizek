import { z } from "zod";
import { datePattern } from "./hotel-content";
import { eachStayNight, validateStayDates } from "@/lib/stay-dates";
import { redactContactInfo } from "@/lib/contact-guard";

const uuid = z.string().uuid();

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

export const availabilityNotePatchSchema = availabilityNoteBaseSchema.partial().extend({
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

export const ratePlanPatchSchema = ratePlanSchema.partial().extend({
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

export const ratePlanPricePatchSchema = ratePlanPriceBaseSchema.partial().extend({
  id: uuid,
});

const promotionBaseSchema = z.object({
  name: z.string().min(1).max(120),
  discountPercent: z.number().int().min(1).max(90),
  validFrom: z.string().regex(datePattern).nullable().optional(),
  validTo: z.string().regex(datePattern).nullable().optional(),
  minNights: z.number().int().positive().nullable().optional(),
  roomIds: z.array(uuid).default([]),
  isActive: z.boolean().default(true),
});
export const promotionSchema = promotionBaseSchema.refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, { message: "Bitiş tarihi başlangıçtan önce olamaz.", path: ["validTo"] });

export const promotionPatchSchema = promotionBaseSchema.partial().extend({
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
