import { expect, test as setup } from "@playwright/test";

import {
  ACCOUNTANT_STATE,
  ADMIN_STATE,
  CASHIER_STATE,
  enrollMfa,
  LOCAL_ACCOUNTANT,
  LOCAL_ADMIN,
  LOCAL_CASHIER,
  login,
} from "./helpers/accounts";
import { totp } from "./helpers/totp";

// Один раз: администратор входит, подключает второй фактор (сброшен в global-setup) и
// сохраняет сессию aal2 — остальные тесты администратора используют её.
setup("администратор: вход с подключением MFA", async ({ page }) => {
  await login(page, LOCAL_ADMIN.email, LOCAL_ADMIN.password);

  // Д-29: без второго фактора администратор попадает только на /mfa.
  await expect(page).toHaveURL(/\/mfa/);
  await enrollMfa(page, totp);
  await page.context().storageState({ path: ADMIN_STATE });
});

// Бухгалтер (Д-29: роль с MFA) — для сценариев закупок.
setup("бухгалтер: вход с подключением MFA", async ({ page }) => {
  await login(page, LOCAL_ACCOUNTANT.email, LOCAL_ACCOUNTANT.password);
  await expect(page).toHaveURL(/\/mfa/);
  await enrollMfa(page, totp);
  await page.context().storageState({ path: ACCOUNTANT_STATE });
});

// Кассир (Д-29: роль с MFA) — для сценариев финансов.
setup("кассир: вход с подключением MFA", async ({ page }) => {
  await login(page, LOCAL_CASHIER.email, LOCAL_CASHIER.password);
  await expect(page).toHaveURL(/\/mfa/);
  await enrollMfa(page, totp);
  await page.context().storageState({ path: CASHIER_STATE });
});
