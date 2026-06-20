// ---------------------------------------------------------------------------
// Auth e2e duman testleri
// Not: Gerçek giriş için DATABASE_URL ve seed kullanıcıları gerekir
// (yonetici@aurelia.dev). DB yoksa yalnızca yönlendirme testleri anlamlıdır.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";

test.describe("Kimlik doğrulama", () => {
  test("oturumsuz /dashboard girişe yönlendirir", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/giris/, { timeout: 20_000 });
    await expect(page.getByLabel("E-posta")).toBeVisible();
  });

  test("yanlış şifrede Türkçe hata gösterir", async ({ page }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("yonetici@aurelia.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByText("E-posta veya şifre hatalı.")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("manager girişi yapar ve /admin'den /dashboard'a yönlendirilir", async ({
    page,
  }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("yonetici@aurelia.dev");
    await page.getByLabel("Şifre", { exact: true }).fill("Yonetici123!");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByText("Otel paneli")).toBeVisible();

    // Manager admin paneline erişemez — geri /dashboard'a düşer
    await page.goto("/admin");
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
});
