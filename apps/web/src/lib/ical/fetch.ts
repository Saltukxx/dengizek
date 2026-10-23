// ---------------------------------------------------------------------------
// iCal akışını güvenli biçimde indirir.
//
// Adresi otel yöneticisi girer ve istek sunucudan çıkar; bu yüzden:
//  - yalnız http(s),
//  - hedef (ve her yönlendirme adımı) genel bir IP'ye çözülmeli — iç ağ,
//    loopback ve bulut metadata adresleri reddedilir,
//  - gövde akış halinde okunur ve sınır aşılınca kesilir (belleğe sınırsız
//    veri alınmaz).
// ---------------------------------------------------------------------------

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Dış akış tek bir isteği süresiz bekletmesin. */
const FETCH_TIMEOUT_MS = 15_000;
export const MAX_FEED_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("224.0.0.0", 3, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  // IPv4-eşlemeli IPv6 (::ffff:10.0.0.1) IPv4 kurallarıyla değerlendirilir.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked.check(mapped[1], "ipv4");
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Takvim adresi geçersiz.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Takvim adresi http(s) olmalıdır.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Error("Takvim adresine erişilemiyor.");
  }
  return url;
}

async function readLimited(res: Response): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) {
    throw new Error("Takvim dosyası çok büyük.");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("Takvim dosyası çok büyük.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchIcalFeed(rawUrl: string): Promise<string> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let target = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(target);
    const res = await fetch(url, {
      signal,
      headers: { Accept: "text/calendar, text/plain" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new Error("Takvim alınamadı (geçersiz yönlendirme).");
      target = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Takvim alınamadı (HTTP ${res.status}).`);
    }
    const text = await readLimited(res);
    // Hata sayfası veya boş gövde "olay yok" sayılırsa önceki senkronun
    // kapattığı bütün geceler yeniden satışa açılır.
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new Error("Yanıt bir iCal takvimi değil.");
    }
    return text;
  }
  throw new Error("Takvim alınamadı (çok fazla yönlendirme).");
}
