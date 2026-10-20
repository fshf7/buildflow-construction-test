import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type Tile = { href: string; label: string; hint?: string | null; icon: LucideIcon };

/** Плитки быстрого доступа (главная, выбор объекта); первая — акцентная, если accentFirst. */
export function SectionTiles({
  tiles,
  accentFirst = false,
}: {
  tiles: Tile[];
  accentFirst?: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map(({ href, label, hint, icon: Icon }, index) => {
        const accent = accentFirst && index === 0;
        return (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "group flex min-h-28 flex-col justify-between gap-3 rounded-3xl p-4 transition-shadow sm:min-h-36 sm:gap-4 sm:p-5",
                accent
                  ? "bg-linear-to-br from-primary to-chart-4 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl"
                  : "border bg-card hover:shadow-lg hover:shadow-panel/5",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-2xl",
                    accent ? "bg-primary-foreground/15" : "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
                    accent ? "border-primary-foreground/30" : "",
                  )}
                >
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-lg font-semibold tracking-tight">{label}</span>
                {hint ? (
                  <span
                    className={cn(
                      "text-sm",
                      accent ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {hint}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
