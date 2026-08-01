// ---------------------------------------------------------------------------
// İmzalama testleri.
//
// NOT: Bu testler implementasyonun YAPISINI kilitler (sıralama, kodlama, önek,
// dizin token'ı, anahtarsız geçiş) — Bunny ile birebir uyum gerçek CDN'e karşı
// doğrulanmalıdır (plan Faz 1.5). Beklenen hash'ler kendi HMAC'imizden
// türetilir; "Bunny böyle hesaplıyor" iddiası taşımazlar.
// ---------------------------------------------------------------------------

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bunnyTokenTtlSec,
  isBunnySigningConfigured,
  signBunnyUrl,
  signPlaybackUrl,
} from "@/lib/bunny/sign";

const KEY = "test-security-key";
const URL_M3U8 = "https://cdn.example.net/abc-guid/playlist.m3u8";

function expectedToken(message: string) {
  return (
    "HS256-" +
    createHmac("sha256", KEY)
      .update(message)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.BUNNY_CDN_TOKEN_KEY = KEY;
  delete process.env.BUNNY_TOKEN_TTL_SEC;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("isBunnySigningConfigured", () => {
  it("anahtar varsa true", () => {
    expect(isBunnySigningConfigured()).toBe(true);
  });

  it("anahtar yoksa false", () => {
    delete process.env.BUNNY_CDN_TOKEN_KEY;
    expect(isBunnySigningConfigured()).toBe(false);
  });
});

describe("bunnyTokenTtlSec", () => {
  it("varsayılan 1 saat", () => {
    expect(bunnyTokenTtlSec()).toBe(3600);
  });

  it("env ile ayarlanır", () => {
    process.env.BUNNY_TOKEN_TTL_SEC = "120";
    expect(bunnyTokenTtlSec()).toBe(120);
  });

  it("geçersiz env'de varsayılana döner", () => {
    process.env.BUNNY_TOKEN_TTL_SEC = "sifir";
    expect(bunnyTokenTtlSec()).toBe(3600);
    process.env.BUNNY_TOKEN_TTL_SEC = "-5";
    expect(bunnyTokenTtlSec()).toBe(3600);
  });
});

describe("signBunnyUrl — anahtar yokken", () => {
  it("URL'i değiştirmeden döner (kademeli açılış)", () => {
    delete process.env.BUNNY_CDN_TOKEN_KEY;
    expect(signBunnyUrl(URL_M3U8)).toBe(URL_M3U8);
  });
});

describe("signBunnyUrl — imzalanamayan girdiler", () => {
  it("mock/göreli yolu değiştirmez", () => {
    expect(signBunnyUrl("/demo/local-sample.mp4")).toBe("/demo/local-sample.mp4");
  });

  it("boş string'i değiştirmez", () => {
    expect(signBunnyUrl("")).toBe("");
  });
});

describe("signBunnyUrl — temel imzalama", () => {
  it("token ve expires ekler", () => {
    const signed = new URL(signBunnyUrl(URL_M3U8, { nowSec: 1_000_000, ttlSec: 60 }));
    expect(signed.searchParams.get("expires")).toBe("1000060");
    expect(signed.searchParams.get("token")).toMatch(/^HS256-/);
  });

  it("mesaj = path + expires + signing_data (IP yok)", () => {
    const signed = new URL(signBunnyUrl(URL_M3U8, { nowSec: 1_000_000, ttlSec: 60 }));
    // tokenPath verilmedi → pathname imzalanır, signing_data boş
    expect(signed.searchParams.get("token")).toBe(
      expectedToken("/abc-guid/playlist.m3u81000060"),
    );
  });

  it("URL-safe base64 üretir (+ / = içermez)", () => {
    // Birçok farklı girdide hiçbir token yasak karakter taşımamalı.
    for (let i = 0; i < 50; i++) {
      const token = new URL(
        signBunnyUrl(`https://cdn.example.net/guid-${i}/playlist.m3u8`, { nowSec: i, ttlSec: 60 }),
      ).searchParams.get("token")!;
      expect(token.slice("HS256-".length)).not.toMatch(/[+/=]/);
    }
  });

  it("orijinal yolu ve host'u korur", () => {
    const signed = new URL(signBunnyUrl(URL_M3U8, { nowSec: 1, ttlSec: 60 }));
    expect(signed.host).toBe("cdn.example.net");
    expect(signed.pathname).toBe("/abc-guid/playlist.m3u8");
  });
});

describe("signBunnyUrl — dizin token'ı (HLS segmentleri)", () => {
  it("token_path'i hem query'ye hem imzaya koyar", () => {
    const signed = new URL(
      signBunnyUrl(URL_M3U8, { tokenPath: "/abc-guid/", nowSec: 1_000_000, ttlSec: 60 }),
    );
    expect(signed.searchParams.get("token_path")).toBe("/abc-guid/");
    // signature_path = token_path; signing_data = "token_path=/abc-guid/"
    expect(signed.searchParams.get("token")).toBe(
      expectedToken("/abc-guid/1000060token_path=/abc-guid/"),
    );
  });

  it("dizin token'ı dosya token'ından farklı imza üretir", () => {
    const withDir = new URL(
      signBunnyUrl(URL_M3U8, { tokenPath: "/abc-guid/", nowSec: 5, ttlSec: 60 }),
    ).searchParams.get("token");
    const withoutDir = new URL(signBunnyUrl(URL_M3U8, { nowSec: 5, ttlSec: 60 })).searchParams.get(
      "token",
    );
    expect(withDir).not.toBe(withoutDir);
  });
});

describe("signBunnyUrl — mevcut query parametreleri", () => {
  it("signing_data alfabetik sıralanır", () => {
    const url = "https://cdn.example.net/g/playlist.m3u8?width=500&aaa=1";
    const signed = new URL(signBunnyUrl(url, { nowSec: 10, ttlSec: 60 }));
    expect(signed.searchParams.get("token")).toBe(
      expectedToken("/g/playlist.m3u870aaa=1&width=500"),
    );
  });

  it("eski token/expires imzaya girmez ve üzerine yazılır", () => {
    const stale = "https://cdn.example.net/g/playlist.m3u8?token=ESKI&expires=1";
    const signed = new URL(signBunnyUrl(stale, { nowSec: 10, ttlSec: 60 }));
    expect(signed.searchParams.get("expires")).toBe("70");
    expect(signed.searchParams.get("token")).toBe(expectedToken("/g/playlist.m3u870"));
  });
});

describe("signPlaybackUrl", () => {
  it("dizini URL'den türetir", () => {
    const signed = new URL(signPlaybackUrl(URL_M3U8, { nowSec: 1_000_000, ttlSec: 60 }));
    expect(signed.searchParams.get("token_path")).toBe("/abc-guid/");
  });

  it("mock yolu değiştirmez", () => {
    expect(signPlaybackUrl("/demo/local-sample.mp4")).toBe("/demo/local-sample.mp4");
  });

  it("anahtar yoksa değiştirmez", () => {
    delete process.env.BUNNY_CDN_TOKEN_KEY;
    expect(signPlaybackUrl(URL_M3U8)).toBe(URL_M3U8);
  });
});

describe("signBunnyUrl — token_path kodlaması", () => {
  it("token_path kodlanmamış '/' ile yazılır (Bunny örnekleriyle aynı)", () => {
    const signed = signBunnyUrl(URL_M3U8, { tokenPath: "/abc-guid/", nowSec: 1, ttlSec: 60 });
    expect(signed).toContain("token_path=/abc-guid/");
    expect(signed).not.toContain("%2F");
  });

  it("imzalı URL tekrar imzalanınca token çoğalmaz", () => {
    const once = signBunnyUrl(URL_M3U8, { tokenPath: "/abc-guid/", nowSec: 1, ttlSec: 60 });
    const twice = signBunnyUrl(once, { tokenPath: "/abc-guid/", nowSec: 1, ttlSec: 60 });
    expect(twice).toBe(once);
    expect(twice.match(/token=/g)).toHaveLength(1);
    expect(twice.match(/token_path=/g)).toHaveLength(1);
  });
});
