import { z } from "zod";
import { datePattern } from "./hotel-content";
import { validateStayDates } from "@/lib/stay-dates";

const uuid = z.string().uuid();

const imageUrl = z.string().min(1).refine(
  (v) => v.startsWith("/") || /^https?:\/\//.test(v),
  "Geçerli bir görsel adresi girin",
);

export const galleryImageSchema = z.object({
  url: imageUrl,
  caption: z.string().max(300).optional(),
  roomId: uuid.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const galleryPatchSchema = galleryImageSchema.partial().extend({
  id: uuid,
});

export const availabilityNoteSchema = z.object({
  label: z.string().min(1).max(200),
  startDate: z.string().regex(datePattern).nullable().optional(),
  endDate: z.string().regex(datePattern).nullable().optional(),
  isBlackout: z.boolean().default(false),
});

export const availabilityNotePatchSchema = availabilityNoteSchema.partial().extend({
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

export const ratePlanPriceSchema = z.object({
  roomId: uuid,
  name: z.string().min(1).max(120),
  startDate: z.string().regex(datePattern),
  endDate: z.string().regex(datePattern),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).default("TRY"),
  minStayNights: z.number().int().positive().nullable().optional(),
});

export const ratePlanPricePatchSchema = ratePlanPriceSchema.partial().extend({
  id: uuid,
});

export const promotionSchema = z.object({
  name: z.string().min(1).max(120),
  discountPercent: z.number().int().min(1).max(90),
  validFrom: z.string().regex(datePattern).nullable().optional(),
  validTo: z.string().regex(datePattern).nullable().optional(),
  minNights: z.number().int().positive().nullable().optional(),
  roomIds: z.array(uuid).default([]),
  isActive: z.boolean().default(true),
});

export const promotionPatchSchema = promotionSchema.partial().extend({
  id: uuid,
});

export const inquiryMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  senderName: z.string().max(120).optional(),
});

export const reviewCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  guestName: z.string().min(1).max(120),
  stayDate: z.string().regex(datePattern).nullable().optional(),
  inquiryId: uuid.nullable().optional(),
});

export const reviewPatchSchema = z.object({
  id: uuid,
  reply: z.string().max(5000).optional(),
  status: z.enum(["beklemede", "yayinda", "reddedildi"]).optional(),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["yayinda", "reddedildi"]),
});

export const bookingCreateSchema = z
  .object({
    roomId: uuid.nullable().optional(),
    ratePlanId: uuid.nullable().optional(),
    inquiryId: uuid.nullable().optional(),
    guestName: z.string().min(1).max(120),
    guestEmail: z.string().email(),
    guestPhone: z.string().max(40).optional(),
    checkIn: z.string().regex(datePattern),
    checkOut: z.string().regex(datePattern),
    adults: z.number().int().min(1).default(2),
    children: z.number().int().min(0).default(0),
    totalMinor: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().length(3).default("TRY"),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const dates = validateStayDates(data.checkIn, data.checkOut);
    if (!dates.ok) {
      ctx.addIssue({ code: "custom", message: dates.error, path: ["checkOut"] });
    }
  });

export const bookingPatchSchema = z.object({
  id: uuid,
  status: z.enum(["beklemede", "onaylandi", "iptal", "no_show"]).optional(),
  notes: z.string().max(2000).optional(),
  totalMinor: z.number().int().nonnegative().nullable().optional(),
});

export const inventoryEntrySchema = z.object({
  roomId: uuid,
  date: z.string().regex(datePattern),
  allotment: z.number().int().min(0),
  stopSell: z.boolean().default(false),
  minStay: z.number().int().positive().nullable().optional(),
  cta: z.boolean().default(false),
  ctd: z.boolean().default(false),
});

export const inventoryPutSchema = z.object({
  entries: z.array(inventoryEntrySchema).min(1).max(500),
});

export const paymentIntentSchema = z.object({
  bookingId: uuid,
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).default("TRY"),
});

export const icalFeedSchema = z.object({
  name: z.string().min(1).max(120),
  importUrl: z.string().url().nullable().optional(),
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
