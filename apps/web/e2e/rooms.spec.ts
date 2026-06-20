// ---------------------------------------------------------------------------
// Oda yönetimi e2e — panelde oda oluşturma + misafir sayfasında görünürlük
// Not: DATABASE_URL ve seed (yonetici@aurelia.dev, aurelia-bay) gerektirir.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";

test.describe("Oda içerik yönetimi", () => {
  test("manager oda oluşturur ve listede görür", async ({ page }) => {
    // Giriş
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("yonetici@aurelia.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Yonetici123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // Odalar sayfası
    await page.goto("/dashboard/rooms");
    await expect(page.getByRole("button", { name: "Yeni oda" })).toBeVisible({
      timeout: 20_000,
    });

    const stamp = Date.now().toString(36);
    const roomName = `E2E Test Odası ${stamp}`;
    const roomSlug = `e2e-test-odasi-${stamp}`;

    // Oluştur çekmecesi
    await page.getByRole("button", { name: "Yeni oda" }).click();
    await page.getByLabel("Oda adı").fill(roomName);
    await page.getByLabel("Oda kimliği (URL)").fill(roomSlug);
    await page.getByRole("button", { name: "Oluştur" }).click();

    // Listede görünür
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`/${roomSlug}`)).toBeVisible();

    // Temizlik — oluşturulan odayı sil
    const card = page.locator("div", { hasText: roomName }).filter({
      has: page.locator(`text=/${roomSlug}`),
    });
    await card
      .first()
      .getByRole("button")
      .last()
      .click();
    await expect(page.getByText("Oda silindi.")).toBeVisible({ timeout: 20_000 });
  });

  test("misafir otel sayfası DB'deki odayı gösterir", async ({ page }) => {
    await page.goto("/hotels/aurelia-bay");
    await expect(
      page.getByRole("heading", { name: "Odalarımız" }),
    ).toBeVisible({ timeout: 20_000 });
    // Seed odası dinamik bölümde görünür (seed adı ASCII yazılmıştır)
    await expect(
      page.getByRole("heading", { name: "Deniz Manzarali Deluxe" }),
    ).toBeVisible();
  });

  test("misafir oda detayı yeni alanları gösterir", async ({ page }) => {
    await page.goto("/hotels/aurelia-bay/rooms/seaview-deluxe");
    await expect(
      page.getByRole("heading", { name: "Deniz Manzarali Deluxe" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("32 m²")).toBeVisible();
    await expect(page.getByText("1 king yatak")).toBeVisible();
  });
});
