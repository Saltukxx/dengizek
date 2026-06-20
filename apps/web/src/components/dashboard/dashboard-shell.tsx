"use client";

// ---------------------------------------------------------------------------
// Otel paneli kabuğu — aydınlık, işlev odaklı yönetim arayüzü
// ---------------------------------------------------------------------------

import {
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  NavLink,
  Menu,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBed,
  IconBedFlat,
  IconBuilding,
  IconCalendar,
  IconChartBar,
  IconChevronDown,
  IconClipboardList,
  IconCoin,
  IconExternalLink,
  IconFolder,
  IconLayoutDashboard,
  IconLink,
  IconLogout,
  IconMessage,
  IconSparkles,
  IconStar,
  IconToolsKitchen2,
  IconUsers,
  IconVideo,
  IconWallet,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ReactNode } from "react";
import { useHotelContext } from "./hotel-context";
import { NotificationBell } from "./notification-bell";

const links = [
  { href: "/dashboard", label: "Genel bakış", icon: IconLayoutDashboard },
  { href: "/dashboard/property", label: "Tesis", icon: IconBuilding },
  { href: "/dashboard/rooms", label: "Odalar", icon: IconBedFlat },
  { href: "/dashboard/restaurants", label: "Restoranlar", icon: IconToolsKitchen2 },
  { href: "/dashboard/extras", label: "Ekstralar", icon: IconSparkles },
  { href: "/dashboard/tours", label: "Turlar", icon: IconVideo },
  { href: "/dashboard/media", label: "Medya", icon: IconFolder },
  { href: "/dashboard/inquiries", label: "Talepler", icon: IconMessage },
  { href: "/dashboard/bookings", label: "Rezervasyonlar", icon: IconCalendar },
  { href: "/dashboard/availability", label: "Müsaitlik", icon: IconCalendar },
  { href: "/dashboard/rate-plans", label: "Fiyat planları", icon: IconCoin },
  { href: "/dashboard/cancellation-rules", label: "İptal kuralları", icon: IconClipboardList },
  { href: "/dashboard/promotions", label: "Kampanyalar", icon: IconSparkles },
  { href: "/dashboard/reviews", label: "Yorumlar", icon: IconStar },
  { href: "/dashboard/analytics", label: "Analitik", icon: IconChartBar },
  { href: "/dashboard/finance", label: "Finans", icon: IconWallet },
  { href: "/dashboard/connectivity", label: "Bağlantılar", icon: IconLink },
  { href: "/dashboard/team", label: "Ekip", icon: IconUsers },
] as const;

export function DashboardShell({
  children,
  userName,
}: {
  children: ReactNode;
  userName?: string;
}) {
  const path = usePathname();
  const [opened, { toggle, close }] = useDisclosure();
  const { hotels, hotel, selectHotel, loading: hotelsLoading } = useHotelContext();

  const initials = (userName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell
      padding="lg"
      navbar={{ width: 248, breakpoint: "sm", collapsed: { mobile: !opened } }}
      header={{ height: 60 }}
      styles={{
        main: { background: "var(--mantine-color-gray-0)" },
        navbar: {
          background: "var(--mantine-color-white)",
          borderRight: "1px solid var(--mantine-color-gray-2)",
        },
        header: {
          background: "var(--mantine-color-white)",
          borderBottom: "1px solid var(--mantine-color-gray-2)",
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Box
              w={34}
              h={34}
              style={{
                display: "grid",
                placeItems: "center",
                borderRadius: 8,
                background: "var(--mantine-color-indigo-6)",
                color: "white",
              }}
            >
              <IconBed size={20} stroke={1.8} />
            </Box>
            <div>
              <Title order={5} lh={1.1}>
                Dengizek
              </Title>
              <Text size="xs" c="dimmed" lh={1.1}>
                Otel paneli
              </Text>
            </div>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {!hotelsLoading && hotels.length > 1 && hotel && (
              <Menu shadow="md" width={260} position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="light"
                    color="indigo"
                    size="xs"
                    rightSection={<IconChevronDown size={14} />}
                    leftSection={<IconBuilding size={14} />}
                  >
                    <Text span truncate maw={140}>
                      {hotel.name}
                    </Text>
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Aktif tesis</Menu.Label>
                  {hotels.map((h) => (
                    <Menu.Item
                      key={h.id}
                      leftSection={<IconBuilding size={14} />}
                      onClick={() => selectHotel(h.id)}
                      fw={h.id === hotel.id ? 600 : 400}
                    >
                      {h.name}
                      {h.city ? ` — ${h.city}` : ""}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            {!hotelsLoading && hotels.length === 1 && hotel && (
              <Text size="xs" c="dimmed" visibleFrom="sm" truncate maw={160}>
                {hotel.name}
              </Text>
            )}
            <NotificationBell />
            <Button
              component={Link}
              href="/"
              target="_blank"
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconExternalLink size={14} />}
              visibleFrom="xs"
            >
              Siteyi görüntüle
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Text size="xs" c="dimmed" mb={6} px="xs" tt="uppercase" fw={700} lts="0.06em">
            Menü
          </Text>
          {links.map((l) => {
            const active =
              path === l.href || (l.href !== "/dashboard" && path?.startsWith(l.href));
            return (
              <NavLink
                key={l.href}
                component={Link}
                href={l.href}
                label={l.label}
                onClick={close}
                leftSection={<l.icon size={18} stroke={1.7} />}
                active={active}
                variant="light"
                fw={active ? 600 : 500}
                mb={2}
                style={{ borderRadius: "var(--mantine-radius-md)" }}
              />
            );
          })}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="sm" />
          <Group justify="space-between" wrap="nowrap" px={4} pb={4}>
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar radius="xl" size={30} color="indigo" variant="filled">
                {initials}
              </Avatar>
              <Text size="sm" fw={500} truncate>
                {userName ?? "Kullanıcı"}
              </Text>
            </Group>
            <Tooltip label="Çıkış yap">
              <UnstyledButton
                aria-label="Çıkış yap"
                onClick={() => signOut({ callbackUrl: "/giris" })}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  color: "var(--mantine-color-red-6)",
                }}
              >
                <IconLogout size={18} stroke={1.8} />
              </UnstyledButton>
            </Tooltip>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1120} mx="auto">
          {children}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
