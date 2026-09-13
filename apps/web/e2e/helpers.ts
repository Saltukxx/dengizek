import { expect, type Page } from "@playwright/test";

export async function login(page: Page, role: "manager" | "admin") {
  const credentials = role === "admin"
    ? { email: "admin@dengizek.dev", password: "Admin123!" }
    : { email: "yonetici@aurelia.dev", password: "Yonetici123!" };

  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(credentials.email);
  await page.getByLabel("Şifre", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 20_000 });
}

export async function disableMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
}

export async function expectPageReady(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByText(/Yükleniyor…|yükleniyor…/)).toHaveCount(0, { timeout: 20_000 });
}
