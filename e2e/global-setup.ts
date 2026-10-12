import { execFileSync } from "node:child_process";

// Перед E2E: локальная организация и пользователи (идемпотентно, только локальная БД);
// второй фактор администратора сбрасывается — тест подключает его заново.
// Отдельным процессом: скрипт — ESM, а Playwright грузит global setup как CommonJS.
export default function globalSetup() {
  execFileSync(process.execPath, ["scripts/seed-local.mts", "--reset-mfa"], { stdio: "inherit" });
}
