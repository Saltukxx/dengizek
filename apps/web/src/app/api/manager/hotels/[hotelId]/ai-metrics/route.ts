// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/ai-metrics — AI tur motoru metrikleri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { computeAiReadinessScore } from "@/lib/ai/readiness-score";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, roomsTable, tourStepsTable, toursTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string }> };

const AI_EVENT_TYPES = [
  "tour_start",
  "tour_complete",
  "tour_auto_start",
  "tour_auto_end",
  "tour_step_view",
  "ai_tool_price",
  "ai_tool_fact",
  "ai_guard_triggered",
] as const;

function payloadNum(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" ? v : null;
}

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const db = getDb();
  const hotel = guard.hotel;

  const publishedTours = await db
    .select({ tourId: toursTable.tourId })
    .from(toursTable)
    .where(and(eq(toursTable.hotelSlug, hotel.slug), eq(toursTable.status, "yayinda")));

  const publishedTourIds = publishedTours.map((t) => t.tourId);

  const [events, steps, rooms] = await Promise.all([
    db
      .select()
      .from(analyticsEventsTable)
      .where(
        and(
          eq(analyticsEventsTable.hotelId, hotel.id),
          gte(analyticsEventsTable.createdAt, since),
        ),
      ),
    publishedTourIds.length > 0
      ? db
          .select({
            stepId: tourStepsTable.stepId,
            aiVisible: tourStepsTable.aiVisible,
            aiDescription: tourStepsTable.aiDescription,
          })
          .from(tourStepsTable)
          .where(
            and(
              eq(tourStepsTable.hotelSlug, hotel.slug),
              inArray(tourStepsTable.tourId, publishedTourIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        name: roomsTable.name,
        priceOnRequest: roomsTable.priceOnRequest,
        priceMinor: roomsTable.priceMinor,
      })
      .from(roomsTable)
      .where(and(eq(roomsTable.hotelId, hotel.id), eq(roomsTable.isActive, true))),
  ]);

  const aiEvents = events.filter((e) =>
    (AI_EVENT_TYPES as readonly string[]).includes(e.eventType),
  );

  const byType = Object.fromEntries(
    AI_EVENT_TYPES.map((t) => [t, aiEvents.filter((e) => e.eventType === t).length]),
  );

  const tourStarts = byType.tour_start ?? 0;
  const tourCompletes = byType.tour_complete ?? 0;
  const completionRate =
    tourStarts > 0 ? Math.round((tourCompletes / tourStarts) * 1000) / 10 : null;

  const maxProgressByTour = new Map<string, number>();
  for (const e of aiEvents.filter((ev) => ev.eventType === "tour_step_view")) {
    const tourId = payloadStr(e.payload ?? {}, "tourId");
    const ratio = payloadNum(e.payload ?? {}, "progressRatio");
    if (!tourId || ratio == null) continue;
    const prev = maxProgressByTour.get(tourId) ?? 0;
    if (ratio > prev) maxProgressByTour.set(tourId, ratio);
  }
  const maxProgressValues = [...maxProgressByTour.values()];
  const avgProgressRatio =
    maxProgressValues.length > 0
      ? Math.round(
          (maxProgressValues.reduce((a, b) => a + b, 0) / maxProgressValues.length) * 1000,
        ) / 1000
      : null;

  const autoStarts = byType.tour_auto_start ?? 0;
  const autoCompletes = aiEvents.filter(
    (e) => e.eventType === "tour_complete" && e.payload?.isAutoTour === true,
  ).length;
  const autoCompletionRate =
    autoStarts > 0 ? Math.round((autoCompletes / autoStarts) * 1000) / 10 : null;

  const readiness = computeAiReadinessScore({
    aiPersona: hotel.aiPersona,
    cancellationPolicy: hotel.cancellationPolicy,
    aiPolicies: hotel.aiPolicies,
    tourSteps: steps,
    rooms,
  });

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString(), days: 30 },
    tourStarts,
    tourCompletes,
    completionRate,
    avgProgressRatio,
    avgProgressNote: "Tur başına görülen maksimum ilerleme oranının ortalaması",
    autoTour: {
      starts: autoStarts,
      completes: autoCompletes,
      completionRate: autoCompletionRate,
    },
    toolUsage: {
      price: byType.ai_tool_price ?? 0,
      fact: byType.ai_tool_fact ?? 0,
    },
    guardTriggered: byType.ai_guard_triggered ?? 0,
    readinessScore: readiness.score,
    readinessIssues: readiness.issues,
    byType,
  });
}
