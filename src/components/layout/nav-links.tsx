"use client";

import { ArrowLeftRight, Building2, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { objectIdFromPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { allowedItems, COMMON_NAV, isActive, itemHref, OBJECT_NAV } from "./nav-items";

const base =
  "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors";

function linkClass(active: boolean) {
  return cn(
    base,
    active
      ? "bg-primary text-primary-foreground shadow-md shadow-primary/40"
      : "text-panel-foreground/85 hover:bg-panel-muted hover:text-panel-foreground",
  );
}

/**
 * Меню на тёмной панели (боковая панель и мобильная шторка), Д-94: внутри объекта
 * (/objects/<id>/…) — разделы только этого объекта, вне — выбор объекта и «Общее».
 * Контекст — по адресу; права и объекты отобраны на сервере (иконки с сервера не передать).
 */
export function NavLinks({
  permissions,
  projects,
  onNavigate,
}: {
  permissions: readonly string[];
  projects: readonly { id: string; label: string }[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const projectId = objectIdFromPath(pathname);

  if (projectId !== null) {
    const project = projects.find((p) => p.id === projectId);
    return (
      <nav aria-label="Разделы объекта" className="flex flex-col gap-1">
        <div className="mb-2 rounded-2xl bg-panel-muted/60 p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-panel-foreground">
            <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{project?.label ?? "Объект"}</span>
          </p>
          <Link
            href="/"
            onClick={onNavigate}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-panel-muted-foreground hover:text-panel-foreground"
          >
            <ArrowLeftRight className="size-3.5" aria-hidden />
            Сменить объект
          </Link>
        </div>
        {allowedItems(OBJECT_NAV, permissions).map((item) => {
          const href = itemHref(item, projectId);
          const active = isActive(pathname, href, item.path === "");
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  const common = allowedItems(COMMON_NAV, permissions);
  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-1">
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={pathname === "/" ? "page" : undefined}
        className={linkClass(pathname === "/")}
      >
        <LayoutGrid className="size-4 shrink-0" aria-hidden />
        Выбор объекта
      </Link>
      {common.length > 0 ? (
        <p className="mt-4 mb-1 px-4 text-[11px] font-medium tracking-wide text-panel-muted-foreground uppercase">
          Общее по организации
        </p>
      ) : null}
      {common.map((item) => {
        const active = isActive(pathname, item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            href={item.path}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={linkClass(active)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
