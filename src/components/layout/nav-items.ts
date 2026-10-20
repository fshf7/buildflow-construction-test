import {
  BookOpen,
  Building,
  ChartColumn,
  ClipboardList,
  ClipboardPaste,
  FileCheck,
  HardHat,
  History,
  LayoutDashboard,
  Landmark,
  ListChecks,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";
import { objectHref } from "@/lib/routes";

export type NavItem = {
  /** Внутри объекта — путь от /objects/<id> ("" — главная объекта); общий раздел — полный адрес. */
  path: string;
  label: string;
  icon: LucideIcon;
  /** Подпись плитки на главной. */
  hint: string;
  /** Пункт виден, если есть ЛЮБОЕ из прав. Пустой список — виден всем участникам. */
  permissions: readonly Permission[];
};

// Д-94: меню объекта — работа только по выбранному ЖК. Видимость — по правам из БД (Д-31).
export const OBJECT_NAV: readonly NavItem[] = [
  { path: "", label: "Главная", icon: LayoutDashboard, hint: "", permissions: [] },
  {
    path: "/procurement",
    label: "Закупки",
    icon: ClipboardList,
    hint: "Новая накладная, журнал накладных, затраты",
    permissions: ["supplier_invoices.view", "goods_receipts.approve_correction"],
  },
  {
    path: "/warehouse",
    label: "Склад",
    icon: Warehouse,
    // Д-98: заявки склада — вкладка склада.
    hint: "Заявки склада, остатки, приёмка, выдача, журнал",
    permissions: ["purchase_requests.view", "stock.view", "stock.view_own_crews"],
  },
  {
    path: "/finance",
    label: "Касса и долги",
    icon: Wallet,
    hint: "Приходы, расходы, долги и оплаты по объекту",
    permissions: ["cash.view", "payables.view", "payment_requests.view"],
  },
  {
    path: "/acts",
    label: "Акты работ",
    icon: FileCheck,
    hint: "Акты бригад: черновик, проверка, утверждение",
    permissions: ["work_acts.view", "work_acts.view_approved"],
  },
  {
    path: "/tasks",
    label: "Задачи",
    icon: ListChecks,
    hint: "Задачи по объекту",
    permissions: ["tasks.view", "tasks.execute", "tasks.manage"],
  },
  {
    path: "/reports",
    label: "Отчёты",
    icon: ChartColumn,
    hint: "Остатки, движения, долги, кассы по объекту",
    // Д-75: раздел открыт по правам отдельных отчётов; склад видит остатки и движение без цен.
    permissions: [
      "stock.view",
      "stock.view_own_crews",
      "payables.view",
      "cash.view",
      "work_acts.view",
      "work_acts.view_approved",
    ],
  },
];

// Д-94: «Общее по организации» — то, что не относится к одному объекту.
export const COMMON_NAV: readonly NavItem[] = [
  {
    path: "/finance",
    label: "Касса без объекта",
    icon: Landmark,
    hint: "Кассы и счета, средства владельца, общие расходы",
    permissions: [
      "cash.view",
      "payment_requests.view",
      "cash_accounts.manage",
      "cash.reversals_report",
    ],
  },
  {
    path: "/reports",
    label: "Отчёты по всем объектам",
    icon: ChartColumn,
    hint: "Остатки, долги, кассы сразу по всем ЖК",
    // Сводка по всем ЖК — тем, у кого есть общий доступ к отчётам (бухгалтер, кассир, управляющий);
    // склад и прораб смотрят отчёты внутри своего объекта.
    permissions: ["reports.view"],
  },
  {
    path: "/crews",
    label: "Бригады",
    icon: HardHat,
    hint: "Бригады, состав, договорные тарифы",
    permissions: ["crews.view"],
  },
  {
    path: "/opening",
    label: "Ввод остатков",
    icon: ClipboardPaste,
    hint: "Начальные остатки на дату старта",
    permissions: ["opening_balances.manage"],
  },
  {
    path: "/projects",
    label: "Объекты",
    icon: Building,
    hint: "Список объектов, блоки, этажи, участники",
    permissions: ["projects.manage"],
  },
  {
    path: "/catalog",
    label: "Справочники",
    icon: BookOpen,
    hint: "Материалы, поставщики, единицы",
    permissions: ["catalog.manage"],
  },
  {
    path: "/admin/members",
    label: "Участники",
    icon: Users,
    hint: "Учётные записи и доступы",
    permissions: ["members.manage"],
  },
  {
    path: "/admin/audit",
    label: "Журнал аудита",
    icon: History,
    hint: "История изменений документов",
    permissions: ["audit.view"],
  },
];

export function allowedItems(items: readonly NavItem[], permissions: readonly string[]): NavItem[] {
  return items.filter(
    (item) =>
      item.permissions.length === 0 || item.permissions.some((p) => permissions.includes(p)),
  );
}

/** Адрес пункта: объектный — внутри выбранного объекта, общий — как есть. */
export function itemHref(item: NavItem, projectId: string | null): string {
  return projectId === null ? item.path : objectHref(projectId, item.path);
}

export function isActive(pathname: string, href: string, exact = false): boolean {
  return exact || href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}
