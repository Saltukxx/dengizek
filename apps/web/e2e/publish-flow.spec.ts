import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Yayın akışı — kesintisiz güncelleme.
//
// Regresyon koruması: eskiden yayındaki bir tesisi güncellemek için önce
// "yeni sürüm" ile taslağa almak gerekiyordu; bu tesisi marketplace'ten anında
// düşürüyor ve admin onaylayana kadar geri getirmiyordu. Artık misafir
// görünürlüğü status'e değil yayımlanmış snapshot'a bağlı
// (bkz. src/lib/hotel-visibility.ts).
// ---------------------------------------------------------------------------

const SLUG = "aurelia-bay";

test.describe("Yayın akışı", () => {
  test("yayındaki tesis incelemeye gönderilince misafire görünmeye devam eder", async ({
    page,
    request,
  }) => {
    // Başlangıç: tesis yayında ve görünür
    await page.goto(`/hotels/${SLUG}`);
    await expect(page.getByRole("heading", { name: /Aurelia Bay/i }).first()).toBeVisible();

    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("yonetici@aurelia.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Yonetici123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // Testin tekrar çalıştırılabilir olması için: taslağı bir kez güncelleyip
    // draftRevision'ı artırırız. Böylece önceki koşudan kalan bekleyen gönderim
    // "bayat" olur ve gönderme butonu her durumda görünür.
    const myHotels = await page.request.get("/api/manager/hotels");
    const hotelId = ((await myHotels.json()).hotels as { id: string; slug: string }[]).find(
      (h) => h.slug === SLUG,
    )?.id;
    expect(hotelId).toBeTruthy();
    const detail = await (await page.request.get(`/api/manager/hotels/${hotelId}`)).json();
    const patched = await page.request.patch(`/api/manager/hotels/${hotelId}`, {
      data: {
        expectedRevision: detail.hotel.draftRevision,
        name: detail.hotel.name,
        contactEmail: detail.hotel.contactEmail ?? "",
        checkInTime: detail.hotel.checkInTime ?? "",
        checkOutTime: detail.hotel.checkOutTime ?? "",
        latitude: detail.hotel.latitude ?? "",
        longitude: detail.hotel.longitude ?? "",
      },
    });
    expect(patched.ok()).toBe(true);

    // Tesisi incelemeye gönder
    await page.goto("/dashboard/property");
    const submit = page.getByRole("button", { name: /İncelemeye gönder|İncelemeyi güncelle/ });
    await expect(submit).toBeVisible({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByText("Tesis incelemeye gönderildi.")).toBeVisible({
      timeout: 20_000,
    });

    // ASIL KONTROL: inceleme sürerken tesis hâlâ yayında olmalı.
    // Oturumsuz istekle bakılır — misafir gözü.
    const hotelRes = await request.get(`/hotels/${SLUG}`);
    expect(hotelRes.status()).toBe(200);

    const browseRes = await request.get("/browse");
    expect(browseRes.status()).toBe(200);
    expect(await browseRes.text()).toContain("Aurelia Bay");

    // Tur da oynatılabilir kalmalı (publishedManifest korunur)
    const tourRes = await request.get(`/tours/${SLUG}/demo-lobby`);
    expect(tourRes.status()).toBe(200);

    // Panelde "yayında kalmaya devam ediyor" bilgilendirmesi görünür
    await page.reload();
    await expect(page.getByText(/yayında kalmaya devam ediyor/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("askıya alınmış tesis misafire kapanır", async ({ page, request }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("admin@dengizek.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Admin123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    // Giriş formu varsayılan olarak /dashboard'a yönlendirir; admin oturumu
    // açıldığını /admin'e erişebilmesinden doğrularız.
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 20_000 });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    // Admin API'si üzerinden askıya al (UI moderasyon durumundan bağımsız)
    const hotels = await page.request.get("/api/admin/hotels");
    const hotelId = ((await hotels.json()).hotels as { id: string; slug: string }[]).find(
      (h) => h.slug === SLUG,
    )?.id;
    expect(hotelId).toBeTruthy();

    await page.request.post(`/api/admin/hotels/${hotelId}/suspend`, {
      data: { action: "suspend", note: "e2e testi" },
    });
    try {
      // Askıdayken misafir tarafı 404
      const suspended = await request.get(`/hotels/${SLUG}`);
      expect(suspended.status()).toBe(404);
    } finally {
      // Sonraki testleri etkilememesi için her durumda geri al
      await page.request.post(`/api/admin/hotels/${hotelId}/suspend`, {
        data: { action: "unsuspend" },
      });
    }

    const restored = await request.get(`/hotels/${SLUG}`);
    expect(restored.status()).toBe(200);
  });
});
