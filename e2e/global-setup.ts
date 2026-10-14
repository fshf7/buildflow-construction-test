import { execFileSync } from "node:child_process";

// Перед E2E: локальная организация и пользователи (идемпотентно, только локальная БД);
// второй фактор администратора сбрасывается — тест подключает его заново; второй фактор
// организации включён (Д-91: по умолчанию выключен) — E2E проверяют строгий режим Д-90.
// Отдельным процессом: скрипт — ESM, а Playwright грузит global setup как CommonJS.
export default function globalSetup() {
  execFileSync(process.execPath, ["scripts/seed-local.mts", "--reset-mfa", "--enforce-mfa"], {
    stdio: "inherit",
  });
}
