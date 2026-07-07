import { z } from "zod";

const row = z.record(z.string(), z.unknown());

/** Admin onayından sonra misafir yüzünün tek ticari veri kaynağı. */
export const hotelContentSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  hotel: row,
  rooms: z.array(row),
  roomRates: z.array(row),
  restaurants: z.array(row),
  extras: z.array(row),
  gallery: z.array(row),
  availabilityNotes: z.array(row),
  cancellationRules: z.array(row),
  ratePlans: z.array(row),
  ratePlanPrices: z.array(row),
  promotions: z.array(row),
});

export type HotelContentSnapshot = z.infer<typeof hotelContentSnapshotSchema>;

export function parseHotelContentSnapshot(value: unknown) {
  return hotelContentSnapshotSchema.safeParse(value);
}
