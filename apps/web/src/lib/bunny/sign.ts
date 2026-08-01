// ---------------------------------------------------------------------------
// Bunny CDN imzalı URL üretimi — Advanced Token Authentication (V2).
//
// NEDEN: imzasız playback URL'i eline geçiren herkes videoyu sınırsız izler ve
// delivery ücreti bize yazılır. Ana plan bunu birinci sınıf güvenlik gereği
// sayıyor (§Security: "Signed, time-limited playback URLs").
//
// FORMÜL (bunny.net/docs/cdn/security/token-authentication/advanced):
//   token   = "HS256-" + Base64URL(HMAC-SHA256(key, message))
//   message = signature_path + expires + user_ip + signing_data
//
//   signature_path : imzalanan yol — token_path verilmişse O, yoksa URL pathname
//   expires        : UNIX saniye
//   user_ip        : IP'ye bağlamıyoruz → boş string (o zaman önek "HS256-")
//   signing_data   : token/expires HARİÇ query parametreleri, alfabetik,
//                    "key=value" ve "&" ile birleşik (token_path da buraya girer)
//
//   Base64 → URL-safe: "+"→"-", "/"→"_", "=" kırpılır
//
// DİZİN TOKEN'I: HLS'te playlist ve .ts segmentleri AYRI isteklerdir. Dosya
// bazlı token yalnızca .m3u8'i açar, segmentler 403 alır. Bu yüzden
// token_path = "/{guid}/" ile tüm dizin imzalanır.
//
// ⚠️ DOĞRULANMADI: Bunny hesabı olmadığından gerçek CDN'e karşı test edilemedi.
// Testler bu implementasyonu regresyona karşı kilitler; Bunny ile birebir
// uyum canlı doğrulamada teyit edilmeli (bkz. plan Faz 1.5). Formül
// değişirse düzeltilecek tek yer BU DOSYADIR.
// ---------------------------------------------------------------------------

import { createHmac } from "node:crypto";

let missingKeyWarned = false;

export function isBunnySigningConfigured(): boolean {
  return Boolean(process.env.BUNNY_CDN_TOKEN_KEY);
}

/** Varsayılan 1 saat; env ile ayarlanabilir (test/kısa TTL senaryoları için). */
export function bunnyTokenTtlSec(): number {
  const raw = Number(process.env.BUNNY_TOKEN_TTL_SEC);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SignBunnyUrlOptions {
  /**
   * İmzalanacak yol. HLS için "/{guid}/" verin — playlist ve segmentleri
   * birlikte yetkilendirir. Verilmezse URL'in kendi pathname'i imzalanır
   * (yalnızca o tek dosya açılır).
   */
  tokenPath?: string;
  ttlSec?: number;
  /** Test için sabitlenebilir zaman (UNIX saniye). */
  nowSec?: number;
}

/**
 * URL'i imzalar. Anahtar yoksa veya URL imzalanabilir değilse (mock/yerel yol,
 * boş string) URL'i DEĞİŞTİRMEDEN döner — geliştirme ve mock akışı kırılmasın,
 * canlıda anahtar eklenerek kademeli açılabilsin diye.
 */
export function signBunnyUrl(url: string, options: SignBunnyUrlOptions = {}): string {
  const key = process.env.BUNNY_CDN_TOKEN_KEY;
  if (!key) {
    if (!missingKeyWarned && process.env.NODE_ENV === "production") {
      missingKeyWarned = true;
      console.warn(
        "[bunny/sign] BUNNY_CDN_TOKEN_KEY tanımlı değil — video URL'leri İMZASIZ sunuluyor.",
      );
    }
    return url;
  }
  // Mock mod ("/demo/local-sample.mp4"), boş URL veya göreli yol imzalanmaz.
  if (!url || !/^https?:\/\//i.test(url)) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const expires = (options.nowSec ?? Math.floor(Date.now() / 1000)) + (options.ttlSec ?? bunnyTokenTtlSec());
  const signaturePath = options.tokenPath ?? parsed.pathname;

  // signing_data: mevcut query + token_path; token/expires hariç, alfabetik.
  const params = new Map<string, string>();
  for (const [k, v] of parsed.searchParams) {
    if (k === "token" || k === "expires") continue;
    params.set(k, v);
  }
  if (options.tokenPath) params.set("token_path", options.tokenPath);

  const signingData = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // user_ip'ye bağlamıyoruz (mobil ağlarda IP değişimi oynatmayı kırar) →
  // boş string, dolayısıyla önek sade "HS256-".
  const message = `${signaturePath}${expires}${""}${signingData}`;
  const token = `HS256-${base64Url(createHmac("sha256", key).update(message).digest())}`;

  const signed = new URL(url);
  signed.searchParams.delete("token");
  signed.searchParams.delete("expires");
  signed.searchParams.delete("token_path");
  signed.searchParams.set("token", token);
  signed.searchParams.set("expires", String(expires));

  // token_path'i URL.searchParams ile eklemiyoruz: "/" karakterini %2F yapıyor,
  // Bunny örnekleri ise kodlanmamış gösteriyor (query string'de "/" RFC 3986'ya
  // göre zaten yasal). İmzada da kodlanmamış hali kullanıldığı için ikisi
  // tutarlı kalsın diye elle ekleniyor.
  const query = signed.searchParams.toString();
  const tokenPathPart = options.tokenPath ? `token_path=${options.tokenPath}&` : "";
  return `${signed.origin}${signed.pathname}?${tokenPathPart}${query}`;
}

/**
 * Bunny Stream playback URL'i için dizin token'ı üretir.
 * "https://cdn/{guid}/playlist.m3u8" → token_path "/{guid}/"
 * Böylece aynı token .m3u8 ve tüm .ts segmentlerini kapsar.
 */
export function signPlaybackUrl(url: string, options: Omit<SignBunnyUrlOptions, "tokenPath"> = {}): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  let dir: string | undefined;
  try {
    const p = new URL(url).pathname;
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash > 0) dir = p.slice(0, lastSlash + 1);
  } catch {
    return url;
  }
  return signBunnyUrl(url, { ...options, tokenPath: dir });
}

/** İmzanın geçerlilik bitişi (UNIX saniye) — istemci yenilemeyi buna göre planlar. */
export function playbackTokenExpiry(nowSec = Math.floor(Date.now() / 1000)): number {
  return nowSec + bunnyTokenTtlSec();
}
