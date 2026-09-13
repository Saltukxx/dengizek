import { expect, test, type Page } from "@playwright/test";
import { disableMotion, expectPageReady, login } from "./helpers";

async function snapshot(page: Page, path: string, name: string, mobile = false) {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await disableMotion(page);
  await expectPageReady(page);
  await expect(page).toHaveScreenshot(`${name}-${mobile ? "mobile" : "desktop"}.png`, {
    fullPage: true,
    mask: [page.locator("img"), page.locator("video"), page.locator("time")],
  });
}

test.describe("Görsel regresyon", () => {
  test("misafir yaz ve kış yüzeyleri", async ({ page }) => {
    for (const [path, name] of [["/", "guest-home"], ["/browse", "guest-browse"], ["/kis", "winter-home"], ["/kis/oteller", "winter-browse"]] as const) {
      await snapshot(page, path, name);
      await snapshot(page, path, name, true);
    }
  });

  test("otel paneli temel ve servis-yok ekranları", async ({ page }) => {
    await login(page, "manager");
    for (const [path, name] of [["/dashboard", "dashboard-overview"], ["/dashboard/property", "dashboard-property"], ["/dashboard/rooms", "dashboard-rooms"], ["/dashboard/bookings", "dashboard-bookings"], ["/dashboard/inquiries", "dashboard-inquiries"], ["/dashboard/media", "dashboard-media-service"], ["/dashboard/finance", "dashboard-finance-service"]] as const) {
      await snapshot(page, path, name);
    }
  });

  test("admin paneli temel ekranları", async ({ page }) => {
    await login(page, "admin");
    for (const [path, name] of [["/admin", "admin-overview"], ["/admin/hotels", "admin-hotels"], ["/admin/moderation", "admin-moderation"], ["/admin/users", "admin-users"]] as const) {
      await snapshot(page, path, name);
    }
  });
});
