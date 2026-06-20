"use client";

// ---------------------------------------------------------------------------
// Medya kütüphanesi — TUS ile doğrudan Bunny'ye yükleme + durum listesi
// Akış: create-video (sunucu, imza) → tus-js-client (istemci → Bunny)
//       → Bunny webhook (sunucu, durum) → listede rozet güncellenir
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconRefresh, IconTrash, IconUpload } from "@tabler/icons-react";
import { mediaStatusColors, mediaStatusLabels } from "@/lib/labels";
import { useMyHotel } from "./use-my-hotel";

interface MediaAsset {
  id: string;
  type: "video" | "image" | "vtt";
  status: "yuklendi" | "isleniyor" | "hazir" | "hata" | "yayinlandi";
  title: string;
  bunnyVideoGuid: string | null;
  playbackUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export function MediaUploader() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [media, setMedia] = useState<MediaAsset[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/media?hotelId=${hotel.id}`);
    const json = await res.json();
    if (json.ok) setMedia(json.media);
  }, [hotel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!hotel || !media) return <Loader />;

  async function startUpload() {
    if (!hotel || !file) return;
    const videoTitle = title.trim() || file.name;

    // 1. Sunucudan GUID + TUS imzası al
    const res = await fetch("/api/manager/media/create-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: hotel.id, title: videoTitle }),
    });
    const json = await res.json();
    if (!json.ok) {
      notifications.show({ color: "red", message: json.error ?? "Yükleme başlatılamadı." });
      return;
    }

    if (json.tus.mock) {
      // Mock mod — Bunny yapılandırılmamış; kayıt oluşturuldu, yükleme atlanır
      notifications.show({
        color: "yellow",
        message:
          "Bunny Stream yapılandırılmamış (mock mod): kayıt oluşturuldu, gerçek yükleme atlandı.",
      });
      setFile(null);
      setTitle("");
      void reload();
      return;
    }

    // 2. tus-js-client ile doğrudan Bunny'ye yükle
    setUploadPct(0);
    const upload = new tus.Upload(file, {
      endpoint: json.tus.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000],
      headers: {
        AuthorizationSignature: json.tus.authorizationSignature,
        AuthorizationExpire: String(json.tus.authorizationExpire),
        VideoId: json.tus.guid,
        LibraryId: json.tus.libraryId,
      },
      metadata: { filetype: file.type, title: videoTitle },
      onError: (err) => {
        console.error("[tus] yükleme hatası:", err);
        setUploadPct(null);
        notifications.show({
          color: "red",
          message: "Yükleme başarısız oldu. Lütfen tekrar deneyin.",
        });
      },
      onProgress: (sent, total) => {
        setUploadPct(Math.round((sent / total) * 100));
      },
      onSuccess: () => {
        setUploadPct(null);
        setFile(null);
        setTitle("");
        notifications.show({
          color: "green",
          message: "Yükleme tamamlandı — video işleniyor.",
        });
        void reload();
      },
    });
    uploadRef.current = upload;
    upload.start();
  }

  async function removeAsset(asset: MediaAsset) {
    const res = await fetch(`/api/manager/media/${asset.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      notifications.show({ color: "gray", message: "Medya silindi." });
      void reload();
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Video yükle</Text>
          <Group grow align="flex-end">
            <FileInput
              label="Video dosyası"
              placeholder="MP4 / MOV seçin"
              accept="video/*"
              value={file}
              onChange={setFile}
              clearable
            />
            <TextInput
              label="Başlık"
              placeholder="Boş bırakılırsa dosya adı kullanılır"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <Button
              leftSection={<IconUpload size={16} />}
              disabled={!file || uploadPct !== null}
              onClick={startUpload}
            >
              Yükle
            </Button>
          </Group>
          {uploadPct !== null && (
            <Progress value={uploadPct} striped animated aria-label="Yükleme ilerlemesi" />
          )}
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button
          variant="default"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={() => void reload()}
        >
          Yenile
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Başlık</Table.Th>
              <Table.Th>Tür</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Tarih</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {media.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" size="sm" py="sm">
                    Henüz medya yok. Yukarıdan video yükleyin.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {media.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>
                  <Text fw={500}>{m.title}</Text>
                  {m.playbackUrl && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {m.playbackUrl}
                    </Text>
                  )}
                  {m.status === "hata" && m.errorMessage && (
                    <Text size="xs" c="red">
                      {m.errorMessage}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{m.type}</Table.Td>
                <Table.Td>
                  <Badge color={mediaStatusColors[m.status]}>
                    {mediaStatusLabels[m.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(m.createdAt).toLocaleString("tr-TR")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removeAsset(m)}
                    >
                      Sil
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
