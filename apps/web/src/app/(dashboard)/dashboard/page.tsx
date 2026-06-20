// ---------------------------------------------------------------------------
// Genel bakış — yöneticinin oteline ait canlı durum özeti
// Sunucu bileşeni: oturumdan üyelik → otel → sayaçlar
// ---------------------------------------------------------------------------

import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBuilding,
  IconFolder,
  IconInfoCircle,
  IconMessage,
  IconVideo,
} from "@tabler/icons-react";
import { and, count, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, isDbConfigured } from "@/lib/db";
import {
  hotelMembersTable,
  hotelsTable,
  inquiriesTable,
  mediaAssetsTable,
  restaurantsTable,
  roomsTable,
  toursTable,
} from "@/lib/db/schema";
import { moderationStatusColors, moderationStatusLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

async function getOverview() {
  if (!isDbConfigured()) return null;
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const [membership] = await db
    .select({
      hotelId: hotelsTable.id,
      slug: hotelsTable.slug,
      name: hotelsTable.name,
      status: hotelsTable.status,
      moderationNote: hotelsTable.moderationNote,
    })
    .from(hotelMembersTable)
    .innerJoin(hotelsTable, eq(hotelMembersTable.hotelId, hotelsTable.id))
    .where(eq(hotelMembersTable.userId, session.user.id))
    .limit(1);

  // Admin de /dashboard'a girebilir — üyeliği yoksa ilk oteli göster
  const hotel =
    membership ??
    (session.user.role === "admin"
      ? (
          await db
            .select({
              hotelId: hotelsTable.id,
              slug: hotelsTable.slug,
              name: hotelsTable.name,
              status: hotelsTable.status,
              moderationNote: hotelsTable.moderationNote,
            })
            .from(hotelsTable)
            .limit(1)
        )[0]
      : undefined);

  if (!hotel) return { hotel: null, counts: null } as const;

  const [tours] = await db
    .select({ n: count() })
    .from(toursTable)
    .where(eq(toursTable.hotelId, hotel.hotelId));
  const [publishedTours] = await db
    .select({ n: count() })
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, hotel.hotelId), eq(toursTable.status, "yayinda")));
  const [pendingTours] = await db
    .select({ n: count() })
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, hotel.hotelId), eq(toursTable.status, "incelemede")));
  const [media] = await db
    .select({ n: count() })
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.hotelId, hotel.hotelId));
  const [newInquiries] = await db
    .select({ n: count() })
    .from(inquiriesTable)
    .where(and(eq(inquiriesTable.hotelId, hotel.hotelId), eq(inquiriesTable.status, "yeni")));
  const [rooms] = await db
    .select({ n: count() })
    .from(roomsTable)
    .where(eq(roomsTable.hotelId, hotel.hotelId));
  const [restaurants] = await db
    .select({ n: count() })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.hotelId, hotel.hotelId));

  return {
    hotel,
    counts: {
      tours: tours.n,
      publishedTours: publishedTours.n,
      pendingTours: pendingTours.n,
      media: media.n,
      newInquiries: newInquiries.n,
      rooms: rooms.n,
      restaurants: restaurants.n,
    },
  } as const;
}

const quickActions = [
  {
    href: "/dashboard/property",
    title: "Tesisi düzenle",
    description: "Bilgiler, fotoğraf ve AI rehber profili",
    icon: IconBuilding,
    color: "indigo",
  },
  {
    href: "/dashboard/tours",
    title: "Turları yönet",
    description: "Adımlar, dallanma ve yayına gönderme",
    icon: IconVideo,
    color: "teal",
  },
  {
    href: "/dashboard/media",
    title: "Video yükle",
    description: "Bunny Stream medya kütüphanesi",
    icon: IconFolder,
    color: "orange",
  },
  {
    href: "/dashboard/inquiries",
    title: "Talepleri yanıtla",
    description: "Misafir mesajları gelen kutusu",
    icon: IconMessage,
    color: "grape",
  },
] as const;

export default async function DashboardHomePage() {
  const data = await getOverview();

  return (
    <Stack gap="lg" py="xs">
      <div>
        <Title order={2}>Genel bakış</Title>
        {data?.hotel ? (
          <Group gap="xs" mt={6}>
            <Text c="dimmed" size="sm">
              {data.hotel.name}
            </Text>
            <Badge color={moderationStatusColors[data.hotel.status]} size="sm">
              {moderationStatusLabels[data.hotel.status]}
            </Badge>
          </Group>
        ) : (
          <Text c="dimmed" size="sm" mt={6}>
            Tesisinizin durumu ve bekleyen işler.
          </Text>
        )}
      </div>

      {!data && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue">
          Veritabanı yapılandırılmamış — özet veriler kullanılamıyor.
        </Alert>
      )}
      {data && !data.hotel && (
        <Alert icon={<IconInfoCircle size={16} />} color="yellow">
          Hesabınıza bağlı bir tesis bulunamadı. Lütfen platform yöneticisiyle
          iletişime geçin.
        </Alert>
      )}

      {data?.hotel?.status === "reddedildi" && data.hotel.moderationNote && (
        <Alert color="red" title="Tesisiniz reddedildi" icon={<IconInfoCircle size={16} />}>
          {data.hotel.moderationNote}
        </Alert>
      )}

      {data?.counts && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
          {[
            {
              label: "Yayında tur",
              value: data.counts.publishedTours,
              sub: `${data.counts.tours} toplam`,
            },
            {
              label: "İncelemede tur",
              value: data.counts.pendingTours,
              sub: "onay bekliyor",
            },
            { label: "Oda tipi", value: data.counts.rooms, sub: "tanımlı" },
            { label: "Restoran", value: data.counts.restaurants, sub: "tanımlı" },
            { label: "Medya varlığı", value: data.counts.media, sub: "kütüphanede" },
            {
              label: "Yeni talep",
              value: data.counts.newInquiries,
              sub: "yanıt bekliyor",
            },
          ].map((c) => (
            <Paper key={c.label} withBorder p="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts="0.04em">
                {c.label}
              </Text>
              <Title order={1} mt={4}>
                {c.value}
              </Title>
              <Text size="xs" c="dimmed" mt={2}>
                {c.sub}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      )}

      <div>
        <Title order={4} mb="sm">
          Hızlı işlemler
        </Title>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
          {quickActions.map((a) => (
            <Card
              key={a.href}
              component={Link}
              href={a.href}
              withBorder
              padding="md"
              style={{ textDecoration: "none" }}
            >
              <ThemeIcon variant="light" color={a.color} size={38} radius="md">
                <a.icon size={20} stroke={1.7} />
              </ThemeIcon>
              <Group justify="space-between" mt="sm" wrap="nowrap">
                <Text fw={600} size="sm">
                  {a.title}
                </Text>
                <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                {a.description}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </div>

      {data?.hotel &&
        (data.hotel.status === "taslak" || data.hotel.status === "reddedildi") && (
          <Paper withBorder p="md">
            <Group justify="space-between" wrap="wrap">
              <div>
                <Text fw={600} size="sm">
                  Tesisiniz henüz yayında değil
                </Text>
                <Text size="xs" c="dimmed">
                  Bilgileri tamamlayıp incelemeye gönderin — onaylanınca misafirler
                  görebilir.
                </Text>
              </div>
              <Button
                component={Link}
                href="/dashboard/property"
                rightSection={<IconArrowRight size={14} />}
              >
                Tesise git
              </Button>
            </Group>
          </Paper>
        )}
    </Stack>
  );
}
