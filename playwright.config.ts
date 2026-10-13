import { defineConfig, devices } from "@playwright/test";

// E2E. Требует запущенного локального Supabase (`npm run db:start`) и .env.local;
// данные готовит global-setup (scripts/seed-local.mts). Браузер: `npx playwright install chromium`.
// В CI — production-сборка (`build` + `start`), локально — dev-сервер.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Asia/Dushanbe",
    // Артефакты для разбора падений (в CI выгружаются в Actions).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: CI ? "retain-on-failure" : "off",
  },
  projects: [
    // Вход администратора с MFA один раз; сессия сохраняется в e2e/.auth (в .gitignore).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    // US-10: ключевые сценарии на смартфоне.
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: CI
      ? `npm run build && npm run start -- --port ${PORT}`
      : `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !CI,
    timeout: 300_000,
  },
});
