"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-items";

/** Меню на тёмной панели (боковая панель и мобильная шторка): активный раздел — фиолетовая «пилюля». */
export function NavLinks({
  allowedHrefs,
  onNavigate,
}: {
  /** Отобраны на сервере по правам пользователя (иконки нельзя передать с сервера — фильтруем здесь). */
  allowedHrefs: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));

  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, ready }) => {
        const base =
          "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors";
        if (!ready) {
          return (
            <span
              key={href}
              aria-disabled
              className={cn(base, "cursor-not-allowed text-panel-muted-foreground/60")}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="rounded-full bg-panel-muted px-2 py-0.5 text-[11px]">скоро</span>
            </span>
          );
        }
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              base,
              active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/40"
                : "text-panel-foreground/85 hover:bg-panel-muted hover:text-panel-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
