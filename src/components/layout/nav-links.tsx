"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-items";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, ready }) => {
        const base =
          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors";
        if (!ready) {
          return (
            <span
              key={href}
              aria-disabled
              className={cn(base, "cursor-not-allowed text-muted-foreground/60")}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="text-xs">скоро</span>
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
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
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
