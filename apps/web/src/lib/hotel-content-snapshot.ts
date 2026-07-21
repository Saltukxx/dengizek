import { asc, eq } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import {
  cancellationRulesTable,
  extrasTable,
  hotelAvailabilityNotesTable,
  hotelGalleryImagesTable,
  hotelsTable,
  promotionsTable,
  ratePlansTable,
  restaurantsTable,
  roomRatePlanPricesTable,
  roomRatesTable,
  roomsTable,
} from "@/lib/db/schema";
import { hotelContentSnapshotSchema, type HotelContentSnapshot } from "@/lib/schemas/hotel-content-snapshot";

type DbLike = Db | Tx;

export async function buildHotelContentSnapshot(db: DbLike, hotelId: string): Promise<HotelContentSnapshot> {
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId)).limit(1);
  if (!hotel) throw new Error("Tesis bulunamadı.");
  const [rooms, roomRates, restaurants, extras, gallery, availabilityNotes, cancellationRules, ratePlans, ratePlanPrices, promotions] = await Promise.all([
    db.select().from(roomsTable).where(eq(roomsTable.hotelId, hotelId)).orderBy(asc(roomsTable.orderIndex)),
    db.select().from(roomRatesTable).where(eq(roomRatesTable.hotelId, hotelId)).orderBy(asc(roomRatesTable.startDate)),
    db.select().from(restaurantsTable).where(eq(restaurantsTable.hotelId, hotelId)).orderBy(asc(restaurantsTable.orderIndex)),
    db.select().from(extrasTable).where(eq(extrasTable.hotelId, hotelId)).orderBy(asc(extrasTable.orderIndex)),
    db.select().from(hotelGalleryImagesTable).where(eq(hotelGalleryImagesTable.hotelId, hotelId)).orderBy(asc(hotelGalleryImagesTable.sortOrder)),
    db.select().from(hotelAvailabilityNotesTable).where(eq(hotelAvailabilityNotesTable.hotelId, hotelId)).orderBy(asc(hotelAvailabilityNotesTable.createdAt)),
    db.select().from(cancellationRulesTable).where(eq(cancellationRulesTable.hotelId, hotelId)).orderBy(asc(cancellationRulesTable.createdAt)),
    db.select().from(ratePlansTable).where(eq(ratePlansTable.hotelId, hotelId)).orderBy(asc(ratePlansTable.createdAt)),
    db.select().from(roomRatePlanPricesTable).where(eq(roomRatePlanPricesTable.hotelId, hotelId)).orderBy(asc(roomRatePlanPricesTable.startDate)),
    db.select().from(promotionsTable).where(eq(promotionsTable.hotelId, hotelId)).orderBy(asc(promotionsTable.createdAt)),
  ]);
  const hotelFields = Object.fromEntries(
    Object.entries(hotel).filter(([key]) => key !== "submittedSnapshot" && key !== "publishedSnapshot"),
  );
  return hotelContentSnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hotel: hotelFields,
    rooms,
    roomRates,
    restaurants,
    extras,
    gallery,
    availabilityNotes,
    cancellationRules,
    ratePlans,
    ratePlanPrices,
    promotions,
  });
}

export function snapshotDiffSummary(published: HotelContentSnapshot | null, submitted: HotelContentSnapshot) {
  const oldHotel = published?.hotel ?? {};
  const changedFields = Object.keys(submitted.hotel).filter((key) => JSON.stringify(oldHotel[key]) !== JSON.stringify(submitted.hotel[key]));
  const count = (key: keyof HotelContentSnapshot) => ({ previous: published?.[key] instanceof Array ? published[key].length : 0, submitted: submitted[key] instanceof Array ? submitted[key].length : 0 });
  const changes = (key: keyof HotelContentSnapshot) => {
    const before = (published?.[key] instanceof Array ? published[key] : []) as Record<string, unknown>[];
    const after = (submitted[key] instanceof Array ? submitted[key] : []) as Record<string, unknown>[];
    const beforeById = new Map(before.map((row) => [String(row.id), row]));
    const afterById = new Map(after.map((row) => [String(row.id), row]));
    return {
      ...count(key),
      added: after.filter((row) => !beforeById.has(String(row.id))).map((row) => String(row.name ?? row.caption ?? row.id)),
      removed: before.filter((row) => !afterById.has(String(row.id))).map((row) => String(row.name ?? row.caption ?? row.id)),
      changed: after.filter((row) => beforeById.has(String(row.id)) && JSON.stringify(beforeById.get(String(row.id))) !== JSON.stringify(row)).map((row) => String(row.name ?? row.caption ?? row.id)),
    };
  };
  const requiredFields = ["name", "city", "country", "shortDescription", "imageUrl"];
  const missingRequiredFields = requiredFields.filter((key) => !submitted.hotel[key]);
  const mediaNotReady = submitted.gallery.filter((item) => !item.url).length + submitted.rooms.filter((item) => !item.imageUrl).length;
  return {
    changedFields,
    collections: {
      rooms: changes("rooms"), restaurants: changes("restaurants"), extras: changes("extras"), gallery: changes("gallery"), promotions: changes("promotions"), ratePlans: changes("ratePlans"),
    },
    readiness: { missingRequiredFields, mediaNotReady, ready: missingRequiredFields.length === 0 && mediaNotReady === 0 },
  };
}
