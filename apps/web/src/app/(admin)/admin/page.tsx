import Link from "next/link";
import { Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { count, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import {
  hotelsTable,
  inquiriesTable,
  reviewsTable,
  toursTable,
  usersTable,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function getCounts() {
  if (!isDbConfigured()) return null;
  const db = getDb();
  const [hotels] = await db.select({ n: count() }).from(hotelsTable);
  const [pendingHotels] = await db
    .select({ n: count() })
    .from(hotelsTable)
    .where(eq(hotelsTable.status, "incelemede"));
  const [pendingTours] = await db
    .select({ n: count() })
    .from(toursTable)
    .where(eq(toursTable.status, "incelemede"));
  const [users] = await db.select({ n: count() }).from(usersTable);
  const [newInquiries] = await db
    .select({ n: count() })
    .from(inquiriesTable)
    .where(eq(inquiriesTable.status, "yeni"));
  const [pendingReviews] = await db
    .select({ n: count() })
    .from(reviewsTable)
    .where(eq(reviewsTable.status, "beklemede"));
  return {
    hotels: hotels.n,
    pendingHotels: pendingHotels.n,
    pendingTours: pendingTours.n,
    users: users.n,
    newInquiries: newInquiries.n,
    pendingReviews: pendingReviews.n,
  };
}

export default async function AdminOverviewPage() {
  const counts = await getCounts();

  const cards = counts
    ? [
        { label: "Toplam otel", value: counts.hotels, href: "/admin/hotels" },
        {
          label: "İncelemede otel",
          value: counts.pendingHotels,
          href: "/admin/hotels?durum=incelemede",
        },
        {
          label: "İncelemede tur",
          value: counts.pendingTours,
          href: "/admin/moderation",
        },
        { label: "Kullanıcı", value: counts.users, href: "/admin/users" },
        {
          label: "Yeni talep",
          value: counts.newInquiries,
          href: "/admin/inquiries?durum=yeni",
        },
        {
          label: "Bekleyen yorum",
          value: counts.pendingReviews,
          href: "/admin/reviews?durum=beklemede",
        },
      ]
    : [];

  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Genel bakış</Title>
        <Text c="dimmed" size="sm">
          Platform durumu ve bekleyen işler.
        </Text>
      </div>
      {!counts && (
        <Text c="dimmed">Veritabanı yapılandırılmamış (DATABASE_URL eksik).</Text>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {cards.map((c) => (
          <Paper
            key={c.label}
            component={Link}
            href={c.href}
            withBorder
            p="md"
            radius="md"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {c.label}
                </Text>
                <Title order={2}>{c.value}</Title>
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
