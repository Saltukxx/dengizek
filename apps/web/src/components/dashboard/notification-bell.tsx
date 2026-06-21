"use client";

import { ActionIcon, Indicator, Menu, Text } from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const bellLimit = 8;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/manager/notifications?sayfa=1&limit=${bellLimit}`);
    const json = await res.json();
    if (json.ok) {
      setItems(json.notifications);
      setHasMore(json.hasMore ?? false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  const unread = items.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    await fetch("/api/manager/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    void reload();
  }

  return (
    <Menu position="bottom-end" width={320} withinPortal>
      <Menu.Target>
        <Indicator inline disabled={unread === 0} label={unread} size={16}>
          <ActionIcon variant="subtle" color="gray" aria-label="Bildirimler">
            <IconBell size={18} />
          </ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        {items.length === 0 && (
          <Menu.Item disabled>
            <Text size="sm" c="dimmed">
              Bildirim yok
            </Text>
          </Menu.Item>
        )}
        {items.map((n) => (
          <Menu.Item key={n.id} onClick={() => void markRead(n.id)}>
            {n.link ? (
              <Link href={n.link} style={{ textDecoration: "none", color: "inherit" }}>
                <Text size="sm" fw={n.readAt ? 400 : 600}>
                  {n.title}
                </Text>
                {n.body && (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {n.body}
                  </Text>
                )}
              </Link>
            ) : (
              <>
                <Text size="sm" fw={n.readAt ? 400 : 600}>
                  {n.title}
                </Text>
                {n.body && (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {n.body}
                  </Text>
                )}
              </>
            )}
          </Menu.Item>
        ))}
        {hasMore && (
          <Menu.Item component={Link} href="/dashboard">
            <Text size="sm" c="dimmed">
              Daha fazla bildirim…
            </Text>
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
