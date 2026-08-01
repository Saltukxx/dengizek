// ---------------------------------------------------------------------------
// Ortam değişkeni doğrulaması — boot'ta (instrumentation.ts) çalışır.
//
// Production'da eksik ZORUNLU değişkenler hata fırlatır (deploy anında görünür
// olsun; istek ortasında R2_NOT_CONFIGURED gibi sürprizler yerine).
// Önerilen ama zorunlu olmayanlar uyarı loglar.
// ---------------------------------------------------------------------------

import { z } from "zod";

const productionRequired = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL zorunlu"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET zorunlu (openssl rand -base64 32)"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL geçerli bir URL olmalı")
    .refine((u) => !u.includes("localhost"), "NEXT_PUBLIC_APP_URL production'da localhost olamaz"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET zorunlu — yoksa cron'lar 401 alır"),
});

/** Grup halinde gerekli: biri varsa hepsi olmalı. */
const featureGroups: Array<{ flag: string; when: (env: NodeJS.ProcessEnv) => boolean; vars: string[] }> = [
  {
    flag: "E-posta (Resend)",
    when: () => true, // production'da e-posta akışları (şifre sıfırlama) çekirdek
    vars: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  {
    flag: "Bunny Stream",
    when: (env) => Boolean(env.BUNNY_STREAM_API_KEY || env.BUNNY_STREAM_LIBRARY_ID),
    vars: [
      "BUNNY_STREAM_API_KEY",
      "BUNNY_STREAM_LIBRARY_ID",
      "BUNNY_STREAM_CDN_HOSTNAME",
      "BUNNY_WEBHOOK_SECRET",
    ],
  },
  {
    flag: "R2 görsel depolama",
    when: (env) => Boolean(env.R2_BUCKET_NAME || env.R2_ACCESS_KEY_ID),
    vars: ["R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_URL"],
  },
  {
    flag: "Stripe (PAYMENTS_ENABLED=true)",
    when: (env) => env.PAYMENTS_ENABLED === "true",
    vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
];

export interface EnvValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === "production" && env.USE_MOCK_DATA !== "true";

  if (isProduction) {
    const parsed = productionRequired.safeParse(env);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
    }
    if (env.USE_MOCK_DATA === "true") {
      errors.push("USE_MOCK_DATA production'da açık olamaz");
    }

    for (const group of featureGroups) {
      if (!group.when(env)) continue;
      const missing = group.vars.filter((v) => !env[v]);
      if (missing.length > 0 && missing.length < group.vars.length) {
        errors.push(`${group.flag}: eksik değişkenler → ${missing.join(", ")}`);
      } else if (missing.length === group.vars.length) {
        warnings.push(`${group.flag}: hiç yapılandırılmamış — özellik devre dışı/mock çalışır`);
      }
    }

    if (!env.OPENAI_API_KEY) {
      warnings.push("OPENAI_API_KEY yok — AI tur sohbeti 503 döner");
    }

    // Bunny yapılandırılmışken imzalama anahtarı yoksa videolar herkese açık
    // kalır (hotlink + delivery maliyeti). Hata değil çünkü kademeli açılışa
    // izin veriyoruz, ama production'da görünür bir uyarı olmalı.
    if (env.BUNNY_STREAM_CDN_HOSTNAME && !env.BUNNY_CDN_TOKEN_KEY) {
      warnings.push(
        "BUNNY_CDN_TOKEN_KEY yok — video URL'leri İMZASIZ sunulur, herkes izleyebilir",
      );
    }
  }

  return { errors, warnings };
}

/**
 * Boot'ta çağrılır. Production'da hata varsa fırlatır (deploy görünür şekilde
 * başarısız olsun); geliştirmede yalnızca loglar.
 */
export function assertEnv(): void {
  const { errors, warnings } = validateEnv();
  for (const w of warnings) {
    console.warn(`[env] UYARI: ${w}`);
  }
  if (errors.length > 0) {
    const message = `[env] Eksik/geçersiz production ortam değişkenleri:\n - ${errors.join("\n - ")}`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }
    console.warn(message);
  }
}
