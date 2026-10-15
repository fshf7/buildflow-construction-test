import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { allowedNavHrefs, NAV_ITEMS } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/page-header";
import { requireOrg } from "@/lib/auth/access";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Главная" };

// Что внутри раздела — подпись плитки быстрого доступа.
const SECTION_HINTS: Record<string, string> = {
  "/projects": "Объекты, блоки, этажи и склады",
  "/procurement": "Заявки склада, накладные, согласования",
  "/warehouse": "Приёмка, выдача, возвраты, остатки",
  "/finance": "Кассы и счета, долги, оплаты",
  "/crews": "Бригады, тарифы, акты работ",
  "/tasks": "Задачи по объектам",
  "/reports": "Остатки, движения, долги, кассы",
  "/catalog": "Материалы, поставщики, единицы",
  "/opening": "Начальные остатки на дату старта",
  "/admin/members": "Учётные записи и доступы",
  "/admin/audit": "История изменений документов",
};

export default async function DashboardPage() {
  const org = await requireOrg();
  const allowed = allowedNavHrefs(org.permissions);
  // Плитки — только разделы, доступные по правам (Д-31); первая — акцентная.
  const sections = NAV_ITEMS.filter((i) => i.href !== "/" && i.ready && allowed.includes(i.href));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Главная"
        description={org.full_name ? `Здравствуйте, ${org.full_name}` : "Быстрый доступ к разделам"}
      />

      {sections.length === 0 ? (
        <p className="text-muted-foreground">
          Доступных разделов пока нет — обратитесь к администратору.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ href, label, icon: Icon }, index) => {
            const accent = index === 0;
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
                    <span
                      className={cn(
                        "text-sm",
                        accent ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {SECTION_HINTS[href] ?? ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
