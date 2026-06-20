import { z } from "zod";
import { tourStepSchema } from "./tour-manifest";

// ---------------------------------------------------------------------------
// Tur editörü şemaları — manager paneli
// ---------------------------------------------------------------------------

/** URL kimliği: küçük harf, rakam ve tire ("ana-tur" gibi) */
const tourIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const tourCreateSchema = z.object({
  tourId: z
    .string()
    .min(2, "Tur kimliği en az 2 karakter olmalı")
    .max(64)
    .regex(tourIdPattern, "Tur kimliği yalnızca küçük harf, rakam ve tire içerebilir"),
  title: z.string().min(1, "Tur başlığı gerekli").max(200),
});

export const tourUpdateSchema = z.object({
  title: z.string().min(1, "Tur başlığı gerekli").max(200),
});

/**
 * Adımların toplu kaydı — mevcut manifest adım şeması yeniden kullanılır.
 * `order` alanı dizideki sıraya göre sunucuda yeniden yazılır.
 */
export const stepsBulkSaveSchema = z.object({
  steps: z.array(tourStepSchema).min(1, "En az bir adım gerekli").max(100),
});

export const stepsReorderSchema = z.object({
  sirali: z
    .array(z.string().min(1))
    .min(1, "Sıralama listesi boş olamaz")
    .max(100),
});

export type TourCreateValues = z.infer<typeof tourCreateSchema>;
export type StepsBulkSaveValues = z.infer<typeof stepsBulkSaveSchema>;
