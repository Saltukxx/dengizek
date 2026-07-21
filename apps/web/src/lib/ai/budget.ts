// ---------------------------------------------------------------------------
// AI günlük bütçe bekçisi — OpenAI çağrısından ÖNCE çalışır.
//
// Harcama analytics_events'teki ai_usage kayıtlarından (UTC gün başından beri)
// toplanır ve estimateCostUsd ile USD'ye çevrilir. İki tavan vardır:
//   - AI_DAILY_BUDGET_USD_PER_HOTEL (varsayılan 5 USD/otel/gün)
//   - AI_DAILY_BUDGET_USD_GLOBAL   (varsayılan 50 USD/gün, tüm oteller)
// Tavan aşımında sohbet 503 döner; tur oynatma etkilenmez.
//
// DB hatasında fail-open: bütçe bir maliyet emniyeti, kullanılabilirlik
// bariyeri değil — kötüye kullanım koruması rate-limit'te (fail-closed).
// ---------------------------------------------------------------------------

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";
import { estimateCostUsd } from "@/lib/ai/token-cost";

const DEFAULT_HOTEL_DAILY_USD = 5;
const DEFAULT_GLOBAL_DAILY_USD = 50;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type AiBudgetDecision =
  | { allowed: true }
  | { allowed: false; scope: "hotel" | "global"; spentUsd: number; capUsd: number };

const tokenSums = {
  inputTokens: sql<string>`coalesce(sum((${analyticsEventsTable.payload}->>'inputTokens')::bigint), 0)`,
  outputTokens: sql<string>`coalesce(sum((${analyticsEventsTable.payload}->>'outputTokens')::bigint), 0)`,
};

export async function checkAiBudget(hotelSlug: string): Promise<AiBudgetDecision> {
  if (!isDbConfigured()) return { allowed: true };

  const hotelCap = envNumber("AI_DAILY_BUDGET_USD_PER_HOTEL", DEFAULT_HOTEL_DAILY_USD);
  const globalCap = envNumber("AI_DAILY_BUDGET_USD_GLOBAL", DEFAULT_GLOBAL_DAILY_USD);

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

    const hotelSpent = estimateCostUsd(
      Number(hotelRows[0]?.inputTokens ?? 0),
      Number(hotelRows[0]?.outputTokens ?? 0),
    );
    if (hotelSpent >= hotelCap) {
      return { allowed: false, scope: "hotel", spentUsd: hotelSpent, capUsd: hotelCap };
    }

    const globalSpent = estimateCostUsd(
      Number(globalRows[0]?.inputTokens ?? 0),
      Number(globalRows[0]?.outputTokens ?? 0),
    );
    if (globalSpent >= globalCap) {
      return { allowed: false, scope: "global", spentUsd: globalSpent, capUsd: globalCap };
    }

    return { allowed: true };
  } catch (err) {
    console.warn("[ai-budget] bütçe kontrolü başarısız, fail-open:", err);
    return { allowed: true };
  }
}
