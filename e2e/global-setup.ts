import { execFileSync } from "node:child_process";

// Перед E2E: гарантируем локального пользователя (идемпотентно, только локальная БД).
// Отдельным процессом: скрипт — ESM, а Playwright грузит global setup как CommonJS.
export default function globalSetup() {
  execFileSync(process.execPath, ["scripts/seed-local.mts"], { stdio: "inherit" });
}
