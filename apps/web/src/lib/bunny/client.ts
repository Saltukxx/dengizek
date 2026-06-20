// ---------------------------------------------------------------------------
// Bunny Stream istemcisi
// Env yoksa mock moda düşer (geliştirmede sahte GUID + örnek oynatma URL'si)
// — böylece medya akışı Bunny hesabı olmadan da test edilebilir.
//
// TUS yükleme akışı:
//  1. Sunucu: POST /library/{id}/videos → GUID
//  2. Sunucu: sha256(libraryId + apiKey + expire + guid) imzası üretir
//  3. İstemci: tus-js-client ile doğrudan Bunny'ye yükler
//  4. Bunny webhook'u durumu günceller (isleniyor → hazir | hata)
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

export function isBunnyConfigured(): boolean {
  return Boolean(
    process.env.BUNNY_STREAM_API_KEY && process.env.BUNNY_STREAM_LIBRARY_ID,
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[bunny] ${name} ortam değişkeni tanımlı değil.`);
  return v;
}

export interface BunnyCreatedVideo {
  guid: string;
  mock: boolean;
}

/** Bunny kütüphanesinde boş video kaydı oluşturur ve GUID döner. */
export async function createVideo(title: string): Promise<BunnyCreatedVideo> {
  if (!isBunnyConfigured()) {
    // Mock mod — deterministik olmayan sahte GUID
    return { guid: `mock-${crypto.randomUUID()}`, mock: true };
  }

  const libraryId = requireEnv("BUNNY_STREAM_LIBRARY_ID");
  const apiKey = requireEnv("BUNNY_STREAM_API_KEY");

  const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: "POST",
    headers: {
      AccessKey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[bunny] Video oluşturulamadı (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { guid: string };
  return { guid: json.guid, mock: false };
}

/** Bunny'den videoyu siler (mock GUID'lerde no-op). */
export async function deleteVideo(guid: string): Promise<void> {
  if (guid.startsWith("mock-") || !isBunnyConfigured()) return;

  const libraryId = requireEnv("BUNNY_STREAM_LIBRARY_ID");
  const apiKey = requireEnv("BUNNY_STREAM_API_KEY");

  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`,
    { method: "DELETE", headers: { AccessKey: apiKey } },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`[bunny] Video silinemedi (${res.status})`);
  }
}

export interface TusUploadCredentials {
  guid: string;
  tusEndpoint: string;
  authorizationSignature: string;
  authorizationExpire: number;
  libraryId: string;
  mock: boolean;
}

/** TUS yüklemesi için imzalı kimlik bilgileri üretir (2 saat geçerli). */
export function buildTusCredentials(guid: string): TusUploadCredentials {
  if (guid.startsWith("mock-") || !isBunnyConfigured()) {
    return {
      guid,
      tusEndpoint: TUS_ENDPOINT,
      authorizationSignature: "mock-signature",
      authorizationExpire: Date.now() + 2 * 60 * 60 * 1000,
      libraryId: "0",
      mock: true,
    };
  }

  const libraryId = requireEnv("BUNNY_STREAM_LIBRARY_ID");
  const apiKey = requireEnv("BUNNY_STREAM_API_KEY");
  const expire = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

  const signature = createHash("sha256")
    .update(`${libraryId}${apiKey}${expire}${guid}`)
    .digest("hex");

  return {
    guid,
    tusEndpoint: TUS_ENDPOINT,
    authorizationSignature: signature,
    authorizationExpire: expire,
    libraryId,
    mock: false,
  };
}

/** HLS oynatma URL'si (CDN hostname env'den). */
export function playbackUrl(guid: string): string {
  if (guid.startsWith("mock-")) {
    // Mock mod — demo videosu
    return "/demo/local-sample.mp4";
  }
  const cdn = process.env.BUNNY_STREAM_CDN_HOSTNAME ?? "";
  return cdn ? `https://${cdn}/${guid}/playlist.m3u8` : "";
}

/** Önizleme görseli URL'si. */
export function thumbnailUrl(guid: string): string {
  if (guid.startsWith("mock-")) return "";
  const cdn = process.env.BUNNY_STREAM_CDN_HOSTNAME ?? "";
  return cdn ? `https://${cdn}/${guid}/thumbnail.jpg` : "";
}
