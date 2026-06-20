import { test, expect } from "@playwright/test";

test("ana sayfa ve keşfet yüklenir", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Keşfet" })).toBeVisible();
});

test("mobil menüden keşfet sayfasına gidilir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü aç" }).click();
  await page.getByRole("link", { name: "Keşfet", exact: true }).click();
  await expect(page).toHaveURL(/\/browse/);
  await expect(page.getByRole("heading", { name: "Keşfet" })).toBeVisible();
});

test("talep formu gönderilince teşekkür sayfasına gider", async ({ page }) => {
  await page.goto("/inquiry");
  await page.getByPlaceholder("Adınız ve soyadınız").fill("Deneme Kullanıcı");
  await page.getByPlaceholder("ornek@email.com").fill("test@example.com");
  await page
    .getByPlaceholder("Tarihler, oda tercihi, özel talepler…")
    .fill("Sessiz bir oda rica ediyorum.");
  await page.getByTestId("inquiry-submit").click();
  // Başarı sayfası ilk derlemede yavaş olabilir (Turbopack on-demand)
  await expect(page).toHaveURL(/\/inquiry\/success/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Teşekkürler" })).toBeVisible({
    timeout: 20_000,
  });
});

test("video turu oynatıcı ve adım metni görünür", async ({ page }) => {
  await page.goto("/tours/aurelia-bay/demo-lobby", { waitUntil: "networkidle" });
  // İçerik kaynağa göre değişir: DB yayın snapshot'ı ("Lobide hos geldiniz")
  // veya DB'siz ortamda mock ("Lobiye hoş geldiniz (demo)") — ikisi de kabul.
  await expect(
    page.getByText(/Lobiye hoş geldiniz \(demo\)|Lobide hos geldiniz/).first(),
  ).toBeVisible({ timeout: 20_000 });
  const video = page.locator("video");
  await expect(video).toBeVisible({ timeout: 20_000 });
  /* Klip penceresi sonuna sarma: gerçek süreye bağımlı e2e’yi deterministik tutar. */
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    const d = el.duration;
    const end = 4.2;
    const t = d > 0 && Number.isFinite(d) ? Math.min(end, d - 0.05) : end;
    el.currentTime = t;
    el.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  await expect(page.getByTestId("tour-branch-b1")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("tour-branch-b1").click();
  // s2 başlığı: DB snapshot "Sahil ve Plaj Alani" | mock "İkinci sahne"
  await expect(
    page.getByText(/İkinci sahne|Sahil ve Plaj Alani/).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tour-seek-bar")).toBeVisible({ timeout: 10_000 });
});
