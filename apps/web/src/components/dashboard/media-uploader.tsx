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
import { panelApi } from "@/lib/panel-api";
import type { RuntimeCapabilities, ServiceStatus } from "@/lib/runtime-capabilities";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";
import { ListPagination } from "./list-pagination";

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
  const { hotel, loading: hotelLoading, error: hotelError, reload: reloadHotels } = useMyHotel();
  const [media, setMedia] = useState<MediaAsset[] | null>(null);
  const [videoStatus, setVideoStatus] = useState<ServiceStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 50;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    setLoadError(null);
    try {
      const [json, capabilityJson] = await Promise.all([
        panelApi<{ media: MediaAsset[]; totalCount?: number; hasMore?: boolean }>(
          `/api/manager/media?hotelId=${hotel.id}&sayfa=${sayfa}`,
        ),
        panelApi<{ capabilities: RuntimeCapabilities }>("/api/manager/capabilities"),
      ]);
      setMedia(json.media);
      setTotalCount(json.totalCount ?? json.media.length);
      setHasMore(json.hasMore ?? false);
      setVideoStatus(capabilityJson.capabilities.services.video);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Medya kütüphanesi yüklenemedi.");
    }
  }, [hotel, sayfa]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) return <PanelError message={hotelError} onRetry={() => void reloadHotels()} />;
  if (loadError) return <PanelError message={loadError} onRetry={() => void reload()} />;
  if (!hotel || !media || !videoStatus) return <PanelLoading label="Medya kütüphanesi yükleniyor…" />;

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
    } else if (json.code === "MEDIA_IN_USE") {
      // Hangi içeriklerin kullandığını göster — yönetici önce oradan kaldırmalı.
      notifications.show({
        color: "red",
        title: "Medya kullanımda",
        message: `${json.error}\n\n${(json.references as string[]).join("\n")}`,
        autoClose: false,
        style: { whiteSpace: "pre-line" },
      });
    } else {
      notifications.show({ color: "red", message: json.error ?? "Silme başarısız oldu." });
    }
  }

  return (
    <Stack gap="md">
      {videoStatus !== "ready" && (
        <Alert
          color={videoStatus === "development" ? "yellow" : "red"}
          icon={<IconAlertCircle size={18} />}
          title={videoStatus === "development" ? "Geliştirme video modu" : "Video servisi kullanılamıyor"}
        >
          {videoStatus === "development"
            ? "Bunny Stream bağlı değil. Bu ortamda oluşturulan kayıtlar açıkça demo olarak işaretlenir; üretimde mock video oluşturulmaz."
            : "Bunny Stream yapılandırılmadığı için video yükleme kapalı. API anahtarı, kütüphane, CDN ve webhook ayarları tamamlandığında yeniden deneyin."}
        </Alert>
      )}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Video yükle</Text>
          <Group grow align="flex-end">
            <FileInput
              label="Video dosyası"
              placeholder="MP4 / MOV seçin"
              styles={{ placeholder: { color: "var(--mantine-color-gray-7)" } }}
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
              disabled={!file || uploadPct !== null || videoStatus === "unavailable"}
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
                  <PanelEmpty title="Henüz medya yok" description="Servis hazır olduğunda yukarıdan ilk videonuzu yükleyin." />
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
        <ListPagination
          sayfa={sayfa}
          hasMore={hasMore}
          totalCount={totalCount}
          limit={limit}
          onSayfaChange={setSayfa}
        />
      </Paper>
    </Stack>
  );
}
