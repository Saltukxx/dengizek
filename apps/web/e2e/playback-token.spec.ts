import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// İmzalı medya URL'leri + yenileme ucu.
//
// Seed medyası göreli demo yolu ("/demo/local-sample.mp4") olduğundan imzalama
// bilinçli olarak atlanır — bu testler o durumda da anlamlı kalacak şekilde
// yazıldı: uç her hâlükârda tutarlı bir sözleşme döndürmeli ve yetkilendirmeyi
// yayın görünürlüğünden almalı.
//
// Gerçek CDN'e karşı imza doğrulaması Bunny hesabı gerektirir (plan Faz 1.5).
// ---------------------------------------------------------------------------

const TOKEN_URL = "/api/tour/playback-token?hotelSlug=aurelia-bay&tourId=demo-lobby";

test.describe("Oynatma token'ı", () => {
  test("yayındaki tur için tutarlı sözleşme döner", async ({ request }) => {
    const res = await request.get(TOKEN_URL);
    expect(res.status()).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.signing).toBe("boolean");
    expect(json.sources).toBeTruthy();

    if (json.signing) {
      // İmzalama açıkken her kaynak token + expires taşımalı ve bitiş
      // zamanı gelecekte olmalı.
      expect(json.mediaTokenExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      for (const src of Object.values(json.sources as Record<string, string>)) {
        if (!src.startsWith("http")) continue; // mock/göreli medya imzalanmaz
        expect(src).toContain("token=HS256-");
        expect(src).toContain("expires=");
      }
    }
  });

  test("adım kimlikleri manifestteki adımlarla eşleşir", async ({ request }) => {
    const json = await (await request.get(TOKEN_URL)).json();
    if (json.signing === false) {
      test.skip(true, "İmzalama kapalı — kaynak haritası boş döner.");
    }
    // Seed turu 3 adımlı (s1..s3)
    expect(Object.keys(json.sources).sort()).toEqual(["s1", "s2", "s3"]);
  });

  test("eksik parametrede 400", async ({ request }) => {
    expect((await request.get("/api/tour/playback-token?hotelSlug=aurelia-bay")).status()).toBe(400);
  });

  test("olmayan turda 404", async ({ request }) => {
    const res = await request.get("/api/tour/playback-token?hotelSlug=aurelia-bay&tourId=yok");
    expect(res.status()).toBe(404);
  });

  test("askıya alınmış tesiste token üretilmez", async ({ page, request }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("admin@dengizek.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Admin123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 20_000 });

    const hotels = await page.request.get("/api/admin/hotels");
    const hotelId = ((await hotels.json()).hotels as { id: string; slug: string }[]).find(
      (h) => h.slug === "aurelia-bay",
    )?.id;
    expect(hotelId).toBeTruthy();

    await page.request.post(`/api/admin/hotels/${hotelId}/suspend`, {
      data: { action: "suspend", note: "e2e" },
    });
    try {
      expect((await request.get(TOKEN_URL)).status()).toBe(404);
    } finally {
      await page.request.post(`/api/admin/hotels/${hotelId}/suspend`, {
        data: { action: "unsuspend" },
      });
    }

    expect((await request.get(TOKEN_URL)).status()).toBe(200);
  });
});
