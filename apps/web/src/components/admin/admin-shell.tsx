"use client";

// ---------------------------------------------------------------------------
// Admin paneli kabuğu — otel paneliyle aynı aydınlık dil, koyu lacivert vurgu
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
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBuilding,
  IconChecklist,
  IconClipboardList,
  IconExternalLink,
  IconLayoutDashboard,
  IconLogout,
  IconMessage,
  IconShieldCheck,
  IconChartBar,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ReactNode } from "react";

const links = [
  { href: "/admin", label: "Genel bakış", icon: IconLayoutDashboard },
  { href: "/admin/hotels", label: "Oteller", icon: IconBuilding },
  { href: "/admin/moderation", label: "İnceleme kuyruğu", icon: IconChecklist },
  { href: "/admin/users", label: "Kullanıcılar", icon: IconUsers },
  { href: "/admin/inquiries", label: "Talepler", icon: IconMessage },
  { href: "/admin/analytics", label: "Analitik", icon: IconChartBar },
  { href: "/admin/audit", label: "Denetim kaydı", icon: IconClipboardList },
] as const;

export function AdminShell({
  children,
  userName,
}: {
  children: ReactNode;
  userName?: string;
}) {
  const path = usePathname();
  const [opened, { toggle, close }] = useDisclosure();

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
                background: "var(--mantine-color-dark-6)",
                color: "white",
              }}
            >
              <IconShieldCheck size={20} stroke={1.8} />
            </Box>
            <div>
              <Title order={5} lh={1.1}>
                Dengizek
              </Title>
              <Text size="xs" c="dimmed" lh={1.1}>
                Platform yönetimi
              </Text>
            </div>
          </Group>
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
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Text size="xs" c="dimmed" mb={6} px="xs" tt="uppercase" fw={700} lts="0.06em">
            Yönetim
          </Text>
          {links.map((l) => {
            const active =
              path === l.href || (l.href !== "/admin" && path?.startsWith(l.href));
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
                color="dark"
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
              <Avatar radius="xl" size={30} color="dark" variant="filled">
                {initials}
              </Avatar>
              <Text size="sm" fw={500} truncate>
                {userName ?? "Yönetici"}
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
