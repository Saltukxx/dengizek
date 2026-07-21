import { z } from "zod";

// sessionToken client-üretilen bir UUID (localStorage) — kimlik doğrulama
// değil, düşük hassasiyetli anonim durum takibi (bkz. plan Faz 3.3).
export const guestSessionUpsertSchema = z.object({
  sessionToken: z.string().min(10).max(128),
  hotelSlug: z.string().min(1).max(200),
  tourId: z.string().min(1).max(200),
  stepsSeen: z.array(z.string().max(200)).max(500),
  lastStepId: z.string().max(200).nullable().optional(),
});

export type GuestSessionUpsertInput = z.infer<typeof guestSessionUpsertSchema>;
