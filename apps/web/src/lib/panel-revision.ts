import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type Db, type Tx } from "@/lib/db";
import { hotelPanelRevisionsTable, hotelsTable } from "@/lib/db/schema";
import { withTransaction } from "@/lib/db/transaction";

export const HOTEL_PANEL_SCOPES = [
  "rooms",
  "restaurants",
  "extras",
  "gallery",
  "availability",
  "cancellation_rules",
  "rate_plans",
  "seasonal_rates",
  "promotions",
  "inventory",
  "connectivity",
] as const;

export type HotelPanelScope = (typeof HOTEL_PANEL_SCOPES)[number];

const PUBLISHED_CONTENT_SCOPES = new Set<HotelPanelScope>([
  "rooms",
  "restaurants",
  "extras",
  "gallery",
  "availability",
  "cancellation_rules",
  "rate_plans",
  "seasonal_rates",
  "promotions",
]);

export interface PanelRevisionSnapshot {
  revision: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export class PanelRevisionConflict extends Error {
  readonly current: PanelRevisionSnapshot;

  constructor(current: PanelRevisionSnapshot) {
    super("Bu içerik başka bir kullanıcı tarafından güncellendi.");
    this.name = "PanelRevisionConflict";
    this.current = current;
  }
}

export class PanelMutationAborted extends Error {
  readonly status: number;

  constructor(error: string, status = 404) {
    super(error);
    this.name = "PanelMutationAborted";
    this.status = status;
  }
}

export function abortPanelMutation(error: string, status = 404): never {
  throw new PanelMutationAborted(error, status);
}

export function readExpectedRevision(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { expectedRevision?: unknown }).expectedRevision;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function expectedRevisionRequiredResponse() {
  return NextResponse.json(
    { ok: false, code: "EXPECTED_REVISION_REQUIRED", error: "expectedRevision gerekli." },
    { status: 400 },
  );
}

export function panelRevisionConflictResponse(error: unknown): NextResponse | null {
  if (error instanceof PanelMutationAborted) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (!(error instanceof PanelRevisionConflict)) return null;
  return NextResponse.json(
    {
      ok: false,
      code: "REVISION_CONFLICT",
      error: error.message,
      currentRevision: error.current.revision,
      updatedAt: error.current.updatedAt?.toISOString() ?? null,
      updatedBy: error.current.updatedBy,
    },
    { status: 409 },
  );
}

export function revisionConflictResponse(
  currentRevision: number | undefined,
  updatedAt: Date | null = null,
  updatedBy: string | null = null,
) {
  return NextResponse.json(
    {
      ok: false,
      code: "REVISION_CONFLICT",
      error: "Bu içerik başka bir kullanıcı tarafından güncellendi.",
      currentRevision,
      updatedAt: updatedAt?.toISOString() ?? null,
      updatedBy,
    },
    { status: 409 },
  );
}

export async function getPanelRevision(
  db: Db,
  hotelId: string,
  scope: HotelPanelScope,
): Promise<PanelRevisionSnapshot> {
  const [row] = await db
    .select({
      revision: hotelPanelRevisionsTable.revision,
      updatedAt: hotelPanelRevisionsTable.updatedAt,
      updatedBy: hotelPanelRevisionsTable.updatedBy,
    })
    .from(hotelPanelRevisionsTable)
    .where(and(
      eq(hotelPanelRevisionsTable.hotelId, hotelId),
      eq(hotelPanelRevisionsTable.scope, scope),
    ))
    .limit(1);
  return row ?? { revision: 1, updatedAt: null, updatedBy: null };
}

interface PanelMutationOptions<T> {
  hotelId: string;
  scope: HotelPanelScope;
  expectedRevision: number;
  updatedBy: string;
  mutate: (tx: Tx) => Promise<T>;
}

export async function runPanelMutation<T>({
  hotelId,
  scope,
  expectedRevision,
  updatedBy,
  mutate,
}: PanelMutationOptions<T>): Promise<{ result: T; revision: number }> {
  return withTransaction(async (tx) => {
    await tx.insert(hotelPanelRevisionsTable).values({ hotelId, scope }).onConflictDoNothing();

    const [locked] = await tx
      .update(hotelPanelRevisionsTable)
      .set({
        revision: sql`${hotelPanelRevisionsTable.revision} + 1`,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(and(
        eq(hotelPanelRevisionsTable.hotelId, hotelId),
        eq(hotelPanelRevisionsTable.scope, scope),
        eq(hotelPanelRevisionsTable.revision, expectedRevision),
      ))
      .returning();

    if (!locked) {
      const [current] = await tx
        .select({
          revision: hotelPanelRevisionsTable.revision,
          updatedAt: hotelPanelRevisionsTable.updatedAt,
          updatedBy: hotelPanelRevisionsTable.updatedBy,
        })
        .from(hotelPanelRevisionsTable)
        .where(and(
          eq(hotelPanelRevisionsTable.hotelId, hotelId),
          eq(hotelPanelRevisionsTable.scope, scope),
        ))
        .limit(1);
      throw new PanelRevisionConflict(current ?? {
        revision: expectedRevision + 1,
        updatedAt: null,
        updatedBy: null,
      });
    }

    const result = await mutate(tx);
    if (PUBLISHED_CONTENT_SCOPES.has(scope)) {
      await tx
        .update(hotelsTable)
        .set({
          draftRevision: sql`${hotelsTable.draftRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(hotelsTable.id, hotelId));
    }

    return { result, revision: locked.revision };
  });
}

/**
 * Panel kaydı dışındaki bir yazımın (rezervasyon onayı, iCal senkronu, birim
 * sayısı değişimi) bir kapsamı değiştirdiğini işaretler. Açık duran panelin
 * eski değerlerle kaydı REVISION_CONFLICT alır; sessizce üzerine yazamaz.
 *
 * Kilit sırası: revizyon satırı her zaman kapsamın veri satırlarından ÖNCE
 * kilitlenir (runPanelMutation ile aynı sıra) — aksi halde panel kaydıyla
 * karşılıklı kilitlenme oluşur.
 */
export async function lockPanelRevision(tx: Tx, hotelId: string, scope: HotelPanelScope) {
  await tx.insert(hotelPanelRevisionsTable).values({ hotelId, scope }).onConflictDoNothing();
  await tx
    .select({ revision: hotelPanelRevisionsTable.revision })
    .from(hotelPanelRevisionsTable)
    .where(and(
      eq(hotelPanelRevisionsTable.hotelId, hotelId),
      eq(hotelPanelRevisionsTable.scope, scope),
    ))
    .for("update");
}

export async function bumpPanelRevision(tx: Tx, hotelId: string, scope: HotelPanelScope) {
  await tx.insert(hotelPanelRevisionsTable).values({ hotelId, scope }).onConflictDoNothing();
  await tx
    .update(hotelPanelRevisionsTable)
    .set({ revision: sql`${hotelPanelRevisionsTable.revision} + 1`, updatedAt: new Date() })
    .where(and(
      eq(hotelPanelRevisionsTable.hotelId, hotelId),
      eq(hotelPanelRevisionsTable.scope, scope),
    ));
}

export function getPanelRevisionFromDatabase(hotelId: string, scope: HotelPanelScope) {
  return getPanelRevision(getDb(), hotelId, scope);
}
