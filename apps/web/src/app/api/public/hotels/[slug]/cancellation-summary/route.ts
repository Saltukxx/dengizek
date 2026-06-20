// ---------------------------------------------------------------------------
// GET /api/public/hotels/[slug]/cancellation-summary — misafir iptal özeti
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { cancellationRulesTable, hotelsTable } from "@/lib/db/schema";

function formatRule(rule: {
  name: string;
  freeUntilDaysBefore: number | null;
  penaltyPercent: number | null;
  depositPercent: number | null;
  customText: string | null;
}): string {
  const parts: string[] = [];
  if (rule.freeUntilDaysBefore != null) {
    parts.push(`Girişten ${rule.freeUntilDaysBefore} gün öncesine kadar ücretsiz iptal`);
  }
  if (rule.penaltyPercent != null) {
    parts.push(`İptal cezası: %${rule.penaltyPercent}`);
  }
  if (rule.depositPercent != null) {
    parts.push(`Depozito: %${rule.depositPercent}`);
  }
  if (rule.customText?.trim()) {
    parts.push(rule.customText.trim());
  }
  return parts.join(" · ") || rule.name;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, summary: null, ruleName: null });
  }

  const db = getDb();
  const [hotel] = await db
    .select({
      cancellationPolicy: hotelsTable.cancellationPolicy,
      cancellationRuleId: hotelsTable.cancellationRuleId,
    })
    .from(hotelsTable)
    .where(and(eq(hotelsTable.slug, slug), eq(hotelsTable.status, "yayinda")))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Otel bulunamadı." }, { status: 404 });
  }

  if (hotel.cancellationRuleId) {
    const [rule] = await db
      .select()
      .from(cancellationRulesTable)
      .where(eq(cancellationRulesTable.id, hotel.cancellationRuleId))
      .limit(1);
    if (rule) {
      return NextResponse.json({
        ok: true,
        ruleName: rule.name,
        summary: formatRule(rule),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ruleName: null,
    summary: hotel.cancellationPolicy?.trim() || null,
  });
}
