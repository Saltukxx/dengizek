// ---------------------------------------------------------------------------
// Admin reklam kodu girişi — yalnız kimlikler, sıkı biçim (serbest script yok).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { AD_TAG_PAGE_PATHS, CONVERSION_LABEL_RE, GA4_ID_RE, GOOGLE_ADS_ID_RE } from "@/lib/ad-tags";

const optionalId = (re: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.string().regex(re, message).optional())
    .optional();

const fields = {
  googleAdsId: optionalId(GOOGLE_ADS_ID_RE, "Google Ads kimliği AW-123456789 biçiminde olmalı"),
  conversionLabel: optionalId(CONVERSION_LABEL_RE, "Dönüşüm etiketi yalnız harf, rakam, - ve _ içerebilir"),
  ga4Id: optionalId(GA4_ID_RE, "GA4 kimliği G-XXXXXXX biçiminde olmalı"),
  note: z.string().trim().max(200).optional(),
};

function checkIds(data: { googleAdsId?: string; conversionLabel?: string; ga4Id?: string }, ctx: z.RefinementCtx) {
  if (!data.googleAdsId && !data.ga4Id) {
    ctx.addIssue({ code: "custom", message: "En az bir kimlik girin (Google Ads ya da GA4).", path: ["googleAdsId"] });
  }
  if (data.conversionLabel && !data.googleAdsId) {
    ctx.addIssue({ code: "custom", message: "Dönüşüm etiketi için Google Ads kimliği gerekli.", path: ["conversionLabel"] });
  }
}

export const adTagCreateSchema = z
  .object({
    pagePath: z.enum(AD_TAG_PAGE_PATHS).optional(),
    hotelId: z.string().uuid().optional(),
    ...fields,
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.pagePath) === Boolean(data.hotelId)) {
      ctx.addIssue({ code: "custom", message: "Bir sayfa ya da bir otel seçin (ikisi birden değil).", path: ["pagePath"] });
    }
    checkIds(data, ctx);
  });

/** Güncelleme: hedef değişmez; kimlikler ve açık/kapalı. */
export const adTagUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    ...fields,
  })
  .superRefine((data, ctx) => {
    // Yalnız aç/kapat isteğinde kimlik kontrolü yapılmaz.
    const touchesIds = "googleAdsId" in data || "ga4Id" in data || "conversionLabel" in data;
    if (touchesIds) checkIds(data, ctx);
  });

export type AdTagCreateInput = z.infer<typeof adTagCreateSchema>;
export type AdTagUpdateInput = z.infer<typeof adTagUpdateSchema>;
