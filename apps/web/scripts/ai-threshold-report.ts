// ---------------------------------------------------------------------------
// AI eşik/guard raporu — completion-engine'deki inquiry-niyet eşiği (0.72)
// ve response-guard davranışını gerçek veriyle ayarlamak için otel-başına
// son 30 günün AI olay oranlarını döker.
//
// Okuma rehberi:
// - guardRate yüksekse: model serbest metinde fiyat yazmaya çalışıyor —
//   forced tool-choice keyword listesi (response-guard PRICE_KEYWORDS)
//   genişletilmeli olabilir.
// - driftRate yüksekse: istemci/sunucu ilerleme hesabı ayrışıyor —
//   completion-engine girdileri (aiVisible adım listesi) incelenmeli.
// - inquiryBlocked yüksekse: openInquiry niyet eşiği (0.72) fazla agresif
//   olabilir; blocked düşük ama erken inquiry şikayeti varsa eşik gevşek.
//
// Kullanım: dotenv -e .env.local -- tsx scripts/ai-threshold-report.ts [gün]
// ---------------------------------------------------------------------------

import { and, gte, inArray } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { analyticsEventsTable } from "../src/lib/db/schema";

const AI_EVENT_TYPES = [
  "ai_usage",
  "ai_guard_triggered",
  "ai_completion_drift",
  "ai_tool_price",
  "ai_tool_fact",
] as const;

type HotelRow = {
  hotelSlug: string;
  usage: number;
  guardTriggered: number;
  drift: number;
  toolPrice: number;
  toolFact: number;
  /** guard tetikleri / sohbet turu — %1 üstü incelemeye değer */
  guardRate: number | null;
  /** drift olayları / sohbet turu */
  driftRate: number | null;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL gerekli.");
    process.exitCode = 1;
    return;
  }

  const days = Number(process.argv[2]) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const db = getDb();
  const events = await db
    .select({
      hotelSlug: analyticsEventsTable.hotelSlug,
      eventType: analyticsEventsTable.eventType,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        gte(analyticsEventsTable.createdAt, since),
        inArray(analyticsEventsTable.eventType, [...AI_EVENT_TYPES]),
      ),
    );

  const byHotel = new Map<string, Record<string, number>>();
  for (const e of events) {
    const slug = e.hotelSlug ?? "(bilinmeyen)";
    const counts = byHotel.get(slug) ?? {};
    counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    byHotel.set(slug, counts);
  }

  const rate = (n: number, d: number): number | null =>
    d > 0 ? Math.round((n / d) * 1000) / 1000 : null;

  const rows: HotelRow[] = [...byHotel.entries()]
    .map(([hotelSlug, c]) => {
      const usage = c.ai_usage ?? 0;
      return {
        hotelSlug,
        usage,
        guardTriggered: c.ai_guard_triggered ?? 0,
        drift: c.ai_completion_drift ?? 0,
        toolPrice: c.ai_tool_price ?? 0,
        toolFact: c.ai_tool_fact ?? 0,
        guardRate: rate(c.ai_guard_triggered ?? 0, usage),
        driftRate: rate(c.ai_completion_drift ?? 0, usage),
      };
    })
    .sort((a, b) => b.usage - a.usage);

  const totals = rows.reduce(
    (acc, r) => ({
      usage: acc.usage + r.usage,
      guardTriggered: acc.guardTriggered + r.guardTriggered,
      drift: acc.drift + r.drift,
      toolPrice: acc.toolPrice + r.toolPrice,
      toolFact: acc.toolFact + r.toolFact,
    }),
    { usage: 0, guardTriggered: 0, drift: 0, toolPrice: 0, toolFact: 0 },
  );

  console.log(
    JSON.stringify(
      {
        period: { days, from: since.toISOString(), to: new Date().toISOString() },
        totals: {
          ...totals,
          guardRate: rate(totals.guardTriggered, totals.usage),
          driftRate: rate(totals.drift, totals.usage),
        },
        hotels: rows,
      },
      null,
      2,
    ),
  );
}

void main();
