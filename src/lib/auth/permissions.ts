/**
 * Коды прав и ролей. Источник истины — БД (таблицы permissions/roles, каталог
 * private.permission_catalog() в миграции Foundation). Здесь — типы и подписи для UI.
 */

export const PERMISSIONS = [
  "projects.view",
  "projects.manage",
  "members.manage",
  "catalog.manage",
  "purchase_requests.view",
  "purchase_requests.manage",
  "prices.view",
  "supplier_invoices.view",
  "supplier_invoices.manage",
  "stock.view",
  "stock.view_own_crews",
  "goods_receipts.post",
  "goods_receipts.approve_correction",
  "material_issues.post",
  "payables.view",
  "payment_requests.view",
  "payment_requests.create",
  "payment_requests.approve",
  "payment_requests.approve_payroll",
  "cash.view",
  "cash.post",
  "cash.reverse",
  "cash.reverse_approve",
  "cash.reversals_report",
  "cash_accounts.manage",
  "crews.view",
  "crews.manage",
  "work_rates.manage",
  "work_acts.view",
  "work_acts.view_approved",
  "work_acts.create",
  "work_acts.approve",
  "tasks.view",
  "tasks.execute",
  "tasks.manage",
  "reports.view",
  "audit.view",
  "opening_balances.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = [
  "accountant",
  "warehouse",
  "cashier",
  "foreman",
  "project_manager",
  "org_admin",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  accountant: "Материальный бухгалтер",
  warehouse: "Заведующий складом",
  cashier: "Кассир",
  foreman: "Прораб",
  project_manager: "Управляющий проектом",
  org_admin: "Администратор организации",
};

/** Роли, которым по умолчанию открыты все объекты (Д-27). Дублирует private.role_defaults_all_projects. */
export function defaultAllProjects(roles: readonly RoleCode[]): boolean {
  return roles.some((r) => r === "accountant" || r === "cashier" || r === "org_admin");
}

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}
