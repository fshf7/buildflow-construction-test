import { ClipboardList, HardHat, Wallet, Warehouse } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: ClipboardList, label: "Заявки и накладные" },
  { icon: Warehouse, label: "Склады объектов" },
  { icon: Wallet, label: "Кассы и долги" },
  { icon: HardHat, label: "Бригады и акты" },
] as const;

/** Общая оболочка экранов входа, пароля, MFA: белая «рама», слева (на широких экранах) — тёмная панель. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 md:p-6">
      <div className="grid w-full max-w-4xl gap-3 rounded-[2rem] bg-background p-3 shadow-xl ring-1 shadow-panel/5 ring-border lg:grid-cols-2">
        <div className="hidden flex-col justify-between gap-8 rounded-[1.5rem] bg-panel p-8 text-panel-foreground lg:flex">
          <p className="text-3xl font-bold tracking-tight">
            Материалы и деньги стройки — в одном месте
          </p>
          <ul className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className={cn(
                  "flex min-h-24 flex-col justify-between rounded-2xl p-4 text-sm font-medium",
                  i === 0
                    ? "bg-linear-to-br from-primary to-chart-4 text-primary-foreground shadow-lg shadow-primary/30"
                    : "bg-panel-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center gap-7 px-3 py-5 sm:px-8 sm:py-10">
          <Brand />
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
            {description ? (
              <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>
            ) : null}
          </div>
          <div>{children}</div>
        </div>
      </div>
    </main>
  );
}
