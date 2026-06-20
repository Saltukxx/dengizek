import { getDb, isDbConfigured } from "@/lib/db";
import { hotelMembersTable, userNotificationsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function notifyHotelMembers(
  hotelId: string,
  input: { type: string; title: string; body?: string; link?: string },
) {
  if (!isDbConfigured()) return;
  const db = getDb();
  const members = await db
    .select({ userId: hotelMembersTable.userId })
    .from(hotelMembersTable)
    .where(eq(hotelMembersTable.hotelId, hotelId));

  if (members.length === 0) return;

  await db.insert(userNotificationsTable).values(
    members.map((m) => ({
      userId: m.userId,
      hotelId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  );
}

export async function notifyUser(
  userId: string,
  input: { type: string; title: string; body?: string; link?: string; hotelId?: string },
) {
  if (!isDbConfigured()) return;
  const db = getDb();
  await db.insert(userNotificationsTable).values({
    userId,
    hotelId: input.hotelId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });
}
