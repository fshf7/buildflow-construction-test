import { Building } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Логотип: фиолетовый знак и название. tone="dark" — на тёмной панели меню. */
export function Brand({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-chart-2 text-primary-foreground shadow-md shadow-primary/30">
        <Building className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-bold tracking-tight">BuildFlow</span>
        <span
          className={cn(
            "text-[11px]",
            tone === "dark" ? "text-panel-muted-foreground" : "text-muted-foreground",
          )}
        >
          Материалы и деньги стройки
        </span>
      </span>
    </Link>
  );
}
