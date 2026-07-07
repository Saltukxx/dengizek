import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  cancellationRulesTable,
  inquiriesTable,
  ratePlansTable,
  roomsTable,
} from "@/lib/db/schema";

function unique(ids: readonly (string | null | undefined)[]) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function assertRoomsBelongToHotel(hotelId: string, roomIds: readonly (string | null | undefined)[]) {
  const ids = unique(roomIds);
  if (ids.length === 0) return true;
  const rows = await getDb()
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotelId), inArray(roomsTable.id, ids)));
  return rows.length === ids.length;
}

export async function assertRatePlanBelongsToHotel(hotelId: string, ratePlanId?: string | null) {
  if (!ratePlanId) return true;
  const rows = await getDb().select({ id: ratePlansTable.id }).from(ratePlansTable).where(
    and(eq(ratePlansTable.hotelId, hotelId), eq(ratePlansTable.id, ratePlanId)),
  ).limit(1);
  return rows.length === 1;
}

export async function assertInquiryBelongsToHotel(hotelId: string, inquiryId?: string | null) {
  if (!inquiryId) return true;
  const rows = await getDb().select({ id: inquiriesTable.id }).from(inquiriesTable).where(
    and(eq(inquiriesTable.hotelId, hotelId), eq(inquiriesTable.id, inquiryId)),
  ).limit(1);
  return rows.length === 1;
}

export async function assertCancellationRuleBelongsToHotel(hotelId: string, ruleId?: string | null) {
  if (!ruleId) return true;
  const rows = await getDb().select({ id: cancellationRulesTable.id }).from(cancellationRulesTable).where(
    and(eq(cancellationRulesTable.hotelId, hotelId), eq(cancellationRulesTable.id, ruleId)),
  ).limit(1);
  return rows.length === 1;
}
