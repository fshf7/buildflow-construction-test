import { defineConfig, devices } from "@playwright/test";

// Smoke против развёрнутого окружения (staging): без локального Supabase, seed и dev-сервера.
// E2E_BASE_URL=https://… E2E_SUPABASE_URL=… E2E_SUPABASE_PUBLISHABLE_KEY=… npx playwright test -c playwright.smoke.config.ts
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("Задайте E2E_BASE_URL");

export default defineConfig({
  testDir: "./e2e/smoke",
  retries: 1,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL, locale: "ru-RU", timezoneId: "Asia/Dushanbe", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
