import {
  ChartColumn,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Settings,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false — раздел появится в одной из следующих фаз; пункт показывается неактивным. */
  ready: boolean;
};

// Порядок — по фазам ТЗ §10. Видимость по правам добавится вместе с RBAC (Foundation).
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboard, ready: true },
  { href: "/procurement", label: "Закупки", icon: ClipboardList, ready: false },
  { href: "/warehouse", label: "Склад", icon: Warehouse, ready: false },
  { href: "/finance", label: "Касса и долги", icon: Wallet, ready: false },
  { href: "/crews", label: "Бригады и акты", icon: HardHat, ready: false },
  { href: "/tasks", label: "Задачи", icon: ListChecks, ready: false },
  { href: "/reports", label: "Отчёты", icon: ChartColumn, ready: false },
  { href: "/admin", label: "Администрирование", icon: Settings, ready: false },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
