"use client";

// ---------------------------------------------------------------------------
// Taslak tur önizlemesi — TourPlayer + uyarı bandı
// ---------------------------------------------------------------------------

import { Alert, Box, Button, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TourPlayer } from "@/components/tour-player/TourPlayer";
import type { TourManifest } from "@/lib/schemas/tour-manifest";
import { useMyHotel } from "./use-my-hotel";

export function TourPreviewClient({ tourId }: { tourId: string }) {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [manifest, setManifest] = useState<TourManifest | null>(null);
  const [hotelName, setHotelName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotel) return;
    (async () => {
      const res = await fetch(
        `/api/manager/hotels/${hotel.id}/tours/${tourId}/preview`,
      );
      const json = await res.json();
      if (json.ok) {
        setManifest(json.manifest);
        setHotelName(json.hotelName ?? hotel.name);
      } else {
        setError(json.error ?? "Önizleme yüklenemedi.");
      }
    })();
  }, [hotel, tourId]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (error) {
    return (
      <Stack gap="md">
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
        <Button
          component={Link}
          href={`/dashboard/tours/${tourId}/edit`}
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          w="fit-content"
        >
          Editöre dön
        </Button>
      </Stack>
    );
  }
  if (!manifest) return <Loader />;

  return (
    <Stack gap={0}>
      <Alert
        color="yellow"
        variant="light"
        icon={<IconAlertTriangle size={18} />}
        styles={{ root: { borderRadius: 0 } }}
      >
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={600} size="sm">
              Taslak önizleme
            </Text>
            <Text size="xs" c="dimmed">
              Misafirler yalnızca onaylanmış turları görür. Kaydedilmemiş değişiklikler
              burada görünmez — önce editörde kaydedin.
            </Text>
          </div>
          <Button
            component={Link}
            href={`/dashboard/tours/${tourId}/edit`}
            variant="subtle"
            size="xs"
            leftSection={<IconArrowLeft size={14} />}
          >
            Editöre dön
          </Button>
        </Group>
      </Alert>
      <Box style={{ minHeight: "calc(100dvh - 120px)" }}>
        <TourPlayer
          manifest={manifest}
          backHref={`/dashboard/tours/${tourId}/edit`}
          backLabel={`${hotelName} — editöre dön`}
        />
      </Box>
    </Stack>
  );
}
