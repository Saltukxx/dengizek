import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { disableMotion, expectPageReady, login } from "./helpers";

async function assertNoSeriousViolations(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await disableMotion(page);
  await expectPageReady(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
    `${path} erişilebilirlik ihlalleri`,
  ).toEqual([]);
}

test.describe("WCAG 2.1 AA kalite kapısı", () => {
  test("kritik misafir ve kış sayfalarında serious/critical ihlal yok", async ({ page }) => {
    for (const path of ["/", "/browse", "/kis", "/kis/oteller", "/inquiry"]) {
      await assertNoSeriousViolations(page, path);
    }
  });

  test("otel panelinin kritik ekranlarında serious/critical ihlal yok", async ({ page }) => {
    await login(page, "manager");
    for (const path of [
      "/dashboard",
      "/dashboard/property",
      "/dashboard/rooms",
      "/dashboard/bookings",
      "/dashboard/media",
      "/dashboard/finance",
    ]) {
      await assertNoSeriousViolations(page, path);
    }
  });

  test("admin panelinin kritik ekranlarında serious/critical ihlal yok", async ({ page }) => {
    await login(page, "admin");
    for (const path of ["/admin", "/admin/hotels", "/admin/moderation", "/admin/reviews", "/admin/users"]) {
      await assertNoSeriousViolations(page, path);
    }
  });
});
