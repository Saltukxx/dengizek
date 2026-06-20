import { z } from "zod";

export const inquiryFormSchema = z.object({
  name: z.string().min(1, "Ad gerekli").max(200),
  email: z.string().email("Geçerli bir e-posta girin"),
  phone: z.string().max(50).optional().or(z.literal("")),
  message: z.string().min(1, "Mesaj gerekli").max(5000),
  marketingConsent: z.boolean(),
  hotelSlug: z.string().optional(),
});

export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
