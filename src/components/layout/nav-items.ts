import {
  BookOpen,
  Building,
  ChartColumn,
  ClipboardList,
  HardHat,
  History,
  LayoutDashboard,
  ListChecks,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Пункт виден, если есть ЛЮБОЕ из прав. Пустой список — виден всем участникам. */
  permissions: readonly Permission[];
  /** false — раздел появится в одной из следующих фаз; пункт показывается неактивным. */
  ready: boolean;
};

// Порядок — по фазам ТЗ §10. Видимость — по правам из БД (Д-31), не по ролям.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboard, permissions: [], ready: true },
  {
    href: "/projects",
    label: "Объекты",
    icon: Building,
    permissions: ["projects.view"],
    ready: true,
  },
  {
    href: "/procurement",
    label: "Закупки",
    icon: ClipboardList,
    permissions: ["purchase_requests.view", "supplier_invoices.view"],
    ready: false,
  },
  {
    href: "/warehouse",
    label: "Склад",
    icon: Warehouse,
    permissions: ["stock.view", "stock.view_own_crews"],
    ready: false,
  },
  {
    href: "/finance",
    label: "Касса и долги",
    icon: Wallet,
    permissions: ["cash.view", "payables.view", "payment_requests.view"],
    ready: false,
  },
  {
    href: "/crews",
    label: "Бригады и акты",
    icon: HardHat,
    permissions: ["crews.view", "work_acts.view"],
    ready: false,
  },
  { href: "/tasks", label: "Задачи", icon: ListChecks, permissions: ["tasks.view"], ready: false },
  {
    href: "/reports",
    label: "Отчёты",
    icon: ChartColumn,
    permissions: ["reports.view"],
    ready: false,
  },
  {
    href: "/catalog",
    label: "Справочники",
    icon: BookOpen,
    permissions: ["catalog.manage"],
    ready: true,
  },
  {
    href: "/admin/members",
    label: "Участники",
    icon: Users,
    permissions: ["members.manage"],
    ready: true,
  },
  {
    href: "/admin/audit",
    label: "Журнал аудита",
    icon: History,
    permissions: ["audit.view"],
    ready: true,
  },
];

/** Адреса пунктов меню, доступных при данных правах. */
export function allowedNavHrefs(permissions: readonly string[]): string[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.permissions.length === 0 || item.permissions.some((p) => permissions.includes(p)),
  ).map((item) => item.href);
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
