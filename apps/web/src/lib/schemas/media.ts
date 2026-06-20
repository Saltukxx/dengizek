import { z } from "zod";

// ---------------------------------------------------------------------------
// Medya şemaları — video oluşturma + Bunny webhook gövdesi
// ---------------------------------------------------------------------------

export const createVideoSchema = z.object({
  hotelId: z.string().uuid("Geçerli bir tesis kimliği gerekli"),
  title: z.string().min(1, "Video başlığı gerekli").max(200),
});

/**
 * Bunny Stream webhook gövdesi.
 * Status: 0 kuyruğa alındı, 1 işleniyor, 2 kodlanıyor, 3 bitiyor,
 *         4 hazır (resolution finished), 5 hata, 6 yükleme bekleniyor
 */
export const bunnyWebhookSchema = z.object({
  VideoLibraryId: z.union([z.string(), z.number()]).optional(),
  VideoGuid: z.string().min(1),
  Status: z.number().int(),
});

export type CreateVideoValues = z.infer<typeof createVideoSchema>;
