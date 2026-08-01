// ---------------------------------------------------------------------------
// Dönemsel fiyat e2e — panelde dönem yönetimi + misafir sayfasında fiyat
// Not: DATABASE_URL ve seed (yonetici@aurelia.dev, aurelia-bay, seaview-deluxe
// odasının "Yaz 2026" dönemi ve %10 indirimi) gerektirir.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";

test.describe("Dönemsel fiyatlar", () => {
  test("manager oda çekmecesinde dönem ekler ve siler", async ({ page }) => {
    // Giriş
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("yonetici@aurelia.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Yonetici123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // Odalar sayfası — seed odasını düzenle
    await page.goto("/dashboard/rooms");
    // En içteki eşleşen Paper = seaview-deluxe oda kartı
    const card = page
      .locator(".mantine-Paper-root")
      .filter({ hasText: "/seaview-deluxe" })
      .last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.locator("button:has(svg.tabler-icon-pencil)").click();

    // Çekmece açılır — seed dönemi görünür. Kenar çubuğunda da aynı metinli bir
    // nav bağlantısı var, o yüzden arama çekmeceye daraltılır.
    const drawer = page.getByLabel("Odayı düzenle");
    await expect(drawer.getByText("Dönemsel fiyatlar")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Dönem adı").first()).toHaveValue("Yaz 2026");

    // Yeni dönem ekle ve kaydet
    const stamp = Date.now().toString(36);
    const rateName = `E2E Dönem ${stamp}`;
    await page.getByRole("button", { name: "Dönem ekle" }).click();
    const newRow = page
      .locator(".mantine-Paper-root")
      .filter({ has: page.getByLabel("Dönem adı") })
      .last();
    await newRow.getByLabel("Dönem adı").fill(rateName);
    await newRow.getByLabel("Başlangıç").fill("2027-06-01");
    await newRow.getByLabel("Bitiş").fill("2027-09-15");
    await newRow.getByLabel("Gecelik fiyat").fill("7500");
    await page.getByRole("button", { name: "Dönemleri kaydet" }).click();
    await expect(page.getByText("Dönemsel fiyatlar kaydedildi.")).toBeVisible({
      timeout: 20_000,
    });

    // Temizlik — satırı BENZERSİZ ADIYLA bul. `.last()` kırılgandı: önceki
    // koşudan kalan bir satır varsa yanlış satıra denk gelip testi düşürüyor,
    // temizlik çalışmadığı için artık büyüyordu (kartopu etkisi).
    const savedInput = page.locator(`input[value="${rateName}"]`);
    await expect(savedInput).toHaveCount(1, { timeout: 10_000 });
    const savedRow = page
      .locator(".mantine-Paper-root")
      .filter({ has: savedInput })
      .last();
    await savedRow.locator("button:has(svg.tabler-icon-trash)").click();
    // Silme kaydedilmeden önce satır formdan kalkmış olmalı.
    await expect(savedInput).toHaveCount(0, { timeout: 10_000 });

    // PUT'un TAMAMLANMASINI bekle. Beklemeden sayfayı yenilemek (ya da testi
    // bitirmek) uçuştaki isteği iptal ediyor; eski hâlinde test yalnızca
    // ekleme adımından kalan toast'ı görüp geçiyor ve DB'de artık satır
    // bırakıyordu.
    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/rates") && r.request().method() === "PUT",
        { timeout: 20_000 },
      ),
      page.getByRole("button", { name: "Dönemleri kaydet" }).click(),
    ]);
    expect(deleteResponse.ok()).toBe(true);

    // Toast'a bakmak yetmez — ekleme adımından kalan toast da eşleşir.
    // Sayfayı tazeleyip satırın GERÇEKTEN gittiğini doğrula.
    await page.reload();
    await card.locator("button:has(svg.tabler-icon-pencil)").click();
    await expect(page.locator(`input[value="${rateName}"]`)).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test("misafir oda detayı dönem fiyatını ve indirimi gösterir", async ({ page }) => {
    await page.goto("/hotels/aurelia-bay/rooms/seaview-deluxe");
    await expect(
      page.getByRole("heading", { name: "Deniz Manzarali Deluxe" }),
    ).toBeVisible({ timeout: 20_000 });

    // Bugün (test tarihi) Yaz 2026 dönemine denk gelir: 6.200 TL, %10 indirimle 5.580 TL
    await expect(page.getByText("Fiyat Dönemleri")).toBeVisible();
    await expect(page.getByText("Yaz 2026").first()).toBeVisible();
    await expect(page.getByText("Erken rezervasyona ozel").first()).toBeVisible();

    // Fiyat dönemleri tablosunda kış dönemi de listelenir
    await expect(page.getByText("Kis 2026-27")).toBeVisible();
  });

  test("misafir sayfası 'Bilmeniz Gerekenler' bölümünü gösterir", async ({ page }) => {
    await page.goto("/hotels/aurelia-bay");
    await expect(
      page.getByRole("heading", { name: "Bilmeniz Gerekenler" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("İptal Politikası")).toBeVisible();
    await expect(page.getByText("Havalimanına 35 km")).toBeVisible();
  });
});
