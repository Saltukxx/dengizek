import { defineConfig, devices } from "@playwright/test";

const port = 3333;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // Dev sunucusu istek üzerine derlediği için paralel işçiler ilk derlemede
  // 30 sn'lik goto zaman aşımına takılıyor — tek işçi kararlı.
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --turbopack -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
