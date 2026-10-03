import { config } from "dotenv";
import postgres from "postgres";
import { test, expect } from "@playwright/test";

config({ path: ".env.local" });

test("ana sayfa ve keşfet yüklenir", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Video turlu oteller" })).toBeVisible();
});

test("mobil menüden keşfet sayfasına gidilir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  const drawer = page.getByRole("navigation", { name: "Mobil menü" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Oteller", exact: true }).click();
  await expect(page).toHaveURL(/\/browse/);
  await expect(page.getByRole("heading", { name: "Video turlu oteller" })).toBeVisible();
});

test("talep formu gönderilince teşekkür sayfasına gider", async ({ page }) => {
  const email = `guest-${Date.now().toString(36)}@example.com`;
  const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
  try {
    await page.goto("/inquiry");
    await page.getByPlaceholder("Adınız ve soyadınız").fill("Deneme Kullanıcı");
    await page.getByPlaceholder("ornek@email.com").fill(email);
    await page.getByPlaceholder("Özel talepler…").fill("Sessiz bir oda rica ediyorum.");
    await page.getByTestId("inquiry-submit").click();
    // Başarı sayfası ilk derlemede yavaş olabilir (Turbopack on-demand)
    await expect(page).toHaveURL(/\/inquiry\/success/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Teşekkürler" })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    if (sql) {
      await sql`
        delete from analytics_events
        where payload->>'inquiryId' in (
          select id::text from inquiries where email = ${email}
        )
      `;
      await sql`delete from email_outbox where to_address = ${email}`;
      await sql`delete from inquiries where email = ${email}`;
      await sql.end();
    }
  }
});

test("video turu oynatıcı ve adım metni görünür", async ({ page }) => {
  await page.goto("/tours/aurelia-bay/demo-lobby", { waitUntil: "networkidle" });
  // CI/DB modunda mock metnini kabul etmek, bozuk yayın manifestini gizler.
  // Yalnız gerçekten DB'siz yerel çalışmada demo fallback beklenir.
  const expectedOpening = process.env.CI
    ? /Lobide hos geldiniz/
    : /Lobide hos geldiniz|Lobiye hoş geldiniz \(demo\)/;
  await expect(page.getByText(expectedOpening).first()).toBeVisible({ timeout: 20_000 });
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
  const expectedSecondStep = process.env.CI
    ? /Sahil ve Plaj Alani/
    : /Sahil ve Plaj Alani|İkinci sahne/;
  await expect(page.getByText(expectedSecondStep).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tour-seek-bar")).toBeVisible({ timeout: 10_000 });
});

test("klavye ile kapılı adım atlanamaz, Enter dal seçer", async ({ page }) => {
  await page.goto("/tours/aurelia-bay/demo-lobby", { waitUntil: "networkidle" });
  const video = page.locator("video");
  await expect(video).toBeVisible({ timeout: 20_000 });
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    const d = el.duration;
    const end = 4.2;
    const t = d > 0 && Number.isFinite(d) ? Math.min(end, d - 0.05) : end;
    el.currentTime = t;
    el.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  const branch = page.getByTestId("tour-branch-b1");
  await expect(branch).toBeVisible({ timeout: 15_000 });
  const firstStepCopy = page.getByText(/Lobide hos geldiniz|Lobiye hoş geldiniz/i).first();
  await expect(firstStepCopy).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(branch).toBeVisible();
  await expect(firstStepCopy).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const expectedSecondStep = process.env.CI
    ? /Sahil ve Plaj Alani/
    : /Sahil ve Plaj Alani|İkinci sahne/;
  await expect(page.getByText(expectedSecondStep).first()).toBeVisible({ timeout: 15_000 });
});
