"use client";

// ---------------------------------------------------------------------------
// Görsel seçici — URL yapıştır veya medya kütüphanesinden seç
// (yükleme altyapısı eklemeden media_assets üzerinden)
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
  Button,
  Box,
  Group,
  Image,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";

interface MediaAssetLite {
  id: string;
  title: string;
  type: string;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
}

export function MediaPicker({
  hotelId,
  value,
  onChange,
  label = "Görsel (URL)",
  mediaType = "image",
}: {
  hotelId: string;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  /** image: kapak/galeri; video: tur adımı klipleri */
  mediaType?: "image" | "video";
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAssetLite[] | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await fetch(`/api/manager/media?hotelId=${hotelId}`);
      const json = await res.json();
      if (json.ok) setAssets(json.media);
    })();
  }, [open, hotelId]);

  const usable = (assets ?? []).filter((a) => {
    if (mediaType === "video") {
      return a.type === "video" && a.playbackUrl;
    }
    return a.thumbnailUrl || (a.type === "image" && a.playbackUrl);
  });

  return (
    <>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <TextInput
          label={label}
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="default"
          leftSection={<IconPhoto size={16} />}
          onClick={() => setOpen(true)}
        >
          Kütüphane
        </Button>
      </Group>
      {value && (
        <Image src={value} alt="Önizleme" h={120} w="auto" fit="cover" radius="md" mt={6} />
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Medya kütüphanesi" size="lg">
        {usable.length === 0 ? (
          <Text c="dimmed" size="sm">
            Kütüphanede kullanılabilir {mediaType === "video" ? "video" : "görsel"} yok.
            Yukarıdaki alana doğrudan URL yapıştırabilirsiniz.
          </Text>
        ) : (
          <SimpleGrid cols={3} spacing="sm">
            {usable.map((a) => {
              const url =
                mediaType === "video"
                  ? (a.playbackUrl ?? "")
                  : (a.thumbnailUrl ?? a.playbackUrl ?? "");
              return (
                <Paper
                  key={a.id}
                  withBorder
                  p={6}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    onChange(url);
                    setOpen(false);
                  }}
                >
                  <Stack gap={4}>
                    {mediaType === "video" ? (
                      <Box
                        h={80}
                        style={{
                          display: "grid",
                          placeItems: "center",
                          background: "var(--mantine-color-gray-1)",
                          borderRadius: "var(--mantine-radius-sm)",
                        }}
                      >
                        <IconPhoto size={24} stroke={1.5} />
                      </Box>
                    ) : (
                      <Image src={a.thumbnailUrl ?? undefined} alt={a.title} h={80} fit="cover" radius="sm" />
                    )}
                    <Text size="xs" truncate>
                      {a.title}
                    </Text>
                  </Stack>
                </Paper>
              );
            })}
          </SimpleGrid>
        )}
      </Modal>
    </>
  );
}
