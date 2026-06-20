import { z } from "zod";
import { validateStayDates } from "@/lib/stay-dates";

export const inquirySourceValues = ["web", "tour_ai", "tour_player"] as const;

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

export const inquiryFormSchema = z
  .object({
    name: z.string().min(1, "Ad gerekli").max(200),
    email: z.string().email("Geçerli bir e-posta girin"),
    phone: z.string().max(50).optional().or(z.literal("")),
    message: z.string().min(1, "Mesaj gerekli").max(5000),
    marketingConsent: z.boolean(),
    hotelSlug: z.string().optional(),
    checkIn: optionalDate,
    checkOut: optionalDate,
    adults: z.number().int().min(1).max(20).optional(),
    children: z.number().int().min(0).max(20).optional(),
    roomSlug: z.string().max(64).optional(),
    tourId: z.string().max(120).optional(),
    stepKey: z.string().max(120).optional(),
    source: z.enum(inquirySourceValues).optional(),
    locale: z.string().max(10).optional(),
  })
  .superRefine((data, ctx) => {
    const dates = validateStayDates(data.checkIn, data.checkOut);
    if (!dates.ok) {
      ctx.addIssue({ code: "custom", message: dates.error, path: ["checkOut"] });
    }
  });

export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
