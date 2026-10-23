// ---------------------------------------------------------------------------
// AI günlük token bekçisi — Gemini çağrısından ÖNCE çalışır.
//
// Faturanın üst sınırıdır: tek bir otel (veya kötüye kullanım) günlük
// kotayı tüketemesin. Kullanım analytics_events'teki ai_usage kayıtlarından
// (UTC gün başından beri) girdi + çıktı token olarak toplanır. İki tavan:
//   - AI_DAILY_TOKENS_PER_HOTEL (varsayılan 1.000.000 token/otel/gün)
//   - AI_DAILY_TOKENS_GLOBAL    (varsayılan 6.000.000 token/gün, tüm oteller)
// gemini-3.1-flash-lite fiyatlarıyla (Ekim 2026) global tavan ≈ 1,5-2 $/gün
// (≈ 55 $/ay) eder; çoğu token girdi olduğu için gerçek tutar bunun altındadır.
// Tavan aşımında sohbet 503 döner; tur oynatma etkilenmez.
//
// DB hatasında fail-open: bu bir yük emniyeti, kullanılabilirlik bariyeri
// değil — kötüye kullanım koruması rate-limit'te (fail-closed).
// ---------------------------------------------------------------------------

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";

const DEFAULT_HOTEL_DAILY_TOKENS = 1_000_000;
const DEFAULT_GLOBAL_DAILY_TOKENS = 6_000_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type AiBudgetDecision =
  | { allowed: true }
  | { allowed: false; scope: "hotel" | "global"; spentTokens: number; capTokens: number };

const tokenSums = {
  inputTokens: sql<string>`coalesce(sum((${analyticsEventsTable.payload}->>'inputTokens')::bigint), 0)`,
  outputTokens: sql<string>`coalesce(sum((${analyticsEventsTable.payload}->>'outputTokens')::bigint), 0)`,
};

export async function checkAiBudget(hotelSlug: string): Promise<AiBudgetDecision> {
  if (!isDbConfigured()) return { allowed: true };

  const hotelCap = envNumber("AI_DAILY_TOKENS_PER_HOTEL", DEFAULT_HOTEL_DAILY_TOKENS);
  const globalCap = envNumber("AI_DAILY_TOKENS_GLOBAL", DEFAULT_GLOBAL_DAILY_TOKENS);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  try {
    const db = getDb();
    const [hotelRows, globalRows] = await Promise.all([
      db
        .select(tokenSums)
        .from(analyticsEventsTable)
        .where(
          and(
            eq(analyticsEventsTable.eventType, "ai_usage"),
            eq(analyticsEventsTable.hotelSlug, hotelSlug),
            gte(analyticsEventsTable.createdAt, dayStart),
          ),
        ),
      db
        .select(tokenSums)
        .from(analyticsEventsTable)
        .where(
          and(
            eq(analyticsEventsTable.eventType, "ai_usage"),
            gte(analyticsEventsTable.createdAt, dayStart),
          ),
        ),
    ]);

    const hotelSpent =
      Number(hotelRows[0]?.inputTokens ?? 0) + Number(hotelRows[0]?.outputTokens ?? 0);
    if (hotelSpent >= hotelCap) {
      return { allowed: false, scope: "hotel", spentTokens: hotelSpent, capTokens: hotelCap };
    }

    const globalSpent =
      Number(globalRows[0]?.inputTokens ?? 0) + Number(globalRows[0]?.outputTokens ?? 0);
    if (globalSpent >= globalCap) {
      return { allowed: false, scope: "global", spentTokens: globalSpent, capTokens: globalCap };
    }

    return { allowed: true };
  } catch (err) {
    console.warn("[ai-budget] bütçe kontrolü başarısız, fail-open:", err);
    return { allowed: true };
  }
}
