"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Вкладки раздела — ссылки (состояние в URL). */
export function SectionTabs({
  tabs,
  label,
}: {
  tabs: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b print:hidden">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
