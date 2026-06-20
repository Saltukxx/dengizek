import { z } from "zod";
import { hotelSpecsSchema } from "./hotel-content";

// ---------------------------------------------------------------------------
// Otel yönetimi şemaları — manager PATCH + admin moderasyon kararı
// Not: slug bilinçli olarak YOK — slug değiştirilemez (tour_steps FK'si
// hotel_slug üzerinden denormalize).
// ---------------------------------------------------------------------------

export const hotelUpdateSchema = hotelSpecsSchema.extend({
  name: z.string().min(1, "Tesis adı gerekli").max(200).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  shortDescription: z.string().max(500, "Kısa açıklama en fazla 500 karakter olabilir").optional(),
  longDescription: z.string().max(5000, "Uzun açıklama en fazla 5000 karakter olabilir").optional(),
  imageUrl: z.string().url("Geçerli bir görsel adresi girin").optional().or(z.literal("")),
  priceLabel: z.string().max(120).optional(),

  // AI profil alanları
  aiPersona: z.string().min(1, "AI persona adı boş olamaz").max(120).optional(),
  aiLanguage: z.string().min(2).max(20).optional(),
  aiFacts: z.array(z.string().min(1).max(300)).max(50, "En fazla 50 gerçek eklenebilir").optional(),
  aiPolicies: z.array(z.string().min(1).max(300)).max(50, "En fazla 50 politika eklenebilir").optional(),
});

export type HotelUpdateValues = z.infer<typeof hotelUpdateSchema>;

export const moderationDecisionSchema = z
  .object({
    karar: z.enum(["onayla", "reddet"], { message: "Karar 'onayla' veya 'reddet' olmalı" }),
    not: z.string().max(2000).optional(),
  })
  .refine((v) => v.karar !== "reddet" || (v.not && v.not.trim().length > 0), {
    message: "Red nedeni belirtilmelidir.",
    path: ["not"],
  });

export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;
