"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Вкладки раздела — ссылки (состояние в URL). Сегментная «капсула», активная вкладка — фиолетовая. */
export function SectionTabs({
  tabs,
  label,
}: {
  /** except — вложенные адреса, на которых вкладка не активна (свои вкладки у них). */
  tabs: { href: string; label: string; except?: string[] }[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    // Закреплена при прокрутке: на телефоне — под шапкой (h-16), на десктопе шапка не липкая.
    <div className="sticky top-16 z-20 -my-2 bg-background/95 py-2 backdrop-blur md:top-0 print:hidden">
      <nav
        aria-label={label}
        className="flex w-fit max-w-full [scrollbar-width:none] gap-1 overflow-x-auto rounded-full bg-muted p-1"
      >
        {tabs.map((t) => {
          const active =
            (pathname === t.href || pathname.startsWith(`${t.href}/`)) &&
            !(t.except ?? []).some((e) => pathname === e || pathname.startsWith(`${e}/`));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
