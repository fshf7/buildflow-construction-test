"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Вкладки раздела — ссылки (состояние в URL). Сегментная «капсула», активная вкладка — фиолетовая. */
export function SectionTabs({
  tabs,
  label,
}: {
  tabs: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="flex w-fit max-w-full [scrollbar-width:none] gap-1 overflow-x-auto rounded-full bg-muted p-1 print:hidden"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
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
  );
}
