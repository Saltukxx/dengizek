"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";

interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
}

export function PropertyGallerySection({ hotelId }: { hotelId: string }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/manager/hotels/${hotelId}/gallery`);
    const json = await res.json();
    if (json.ok) setImages(json.images);
  }, [hotelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/manager/media/upload-image", { method: "POST", body: form });
    const json = await res.json();
    if (!json.ok) {
      notifications.show({ color: "red", message: json.error ?? "Yükleme başarısız." });
      return;
    }
    const addRes = await fetch(`/api/manager/hotels/${hotelId}/gallery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: json.url, caption: caption || undefined }),
    });
    if ((await addRes.json()).ok) {
      setCaption("");
      void reload();
    }
  }

  async function removeImage(id: string) {
    await fetch(`/api/manager/hotels/${hotelId}/gallery`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void reload();
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Title order={5}>Foto galerisi</Title>
        <Text size="sm" c="dimmed">
          Tesis sayfasında gösterilecek ek görseller.
        </Text>
        <Group align="flex-end">
          <TextInput
            label="Altyazı (opsiyonel)"
            value={caption}
            onChange={(e) => setCaption(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={() => fileRef.current?.click()}>
            Görsel yükle
          </Button>
        </Group>
        {images.length > 0 && (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
            {images.map((img) => (
              <Paper key={img.id} withBorder p="xs" radius="md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.caption ?? ""}
                  style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }}
                />
                {img.caption && (
                  <Text size="xs" mt={4} lineClamp={1}>
                    {img.caption}
                  </Text>
                )}
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  mt={4}
                  fullWidth
                  leftSection={<IconTrash size={14} />}
                  onClick={() => removeImage(img.id)}
                >
                  Sil
                </Button>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Paper>
  );
}
