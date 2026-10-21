import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

const SECTIONS = ["requests", "incoming", "outgoing", "services", "norms", "report"] as const;

/**
 * Склад (Д-98, Д-100) — как их Google Таблица: заявки склада, остатки (с кнопками приёмки,
 * выдачи, возврата), приход, расход, услуги, нормативы, отчёт за период.
 */
export default async function WarehouseLayout({
  children,
  params,
}: LayoutProps<"/objects/[projectId]/warehouse">) {
  const { projectId } = await params;
  const org = await requireOrg();
  if (
    !hasAnyPermission(org, [
      "purchase_requests.view",
      "stock.view",
      "stock.view_own_crews",
      "norms.manage",
    ])
  )
    redirect("/no-access?reason=forbidden");
  const href = (path: string) => objectHref(projectId, path);
  const stock = hasPermission(org, "stock.view");
  const ownCrews = hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]);
  const tabs = [
    ...(hasPermission(org, "purchase_requests.view")
      ? [{ href: href("/warehouse/requests"), label: "Заявки склада" }]
      : []),
    ...(stock
      ? [
          {
            href: href("/warehouse"),
            label: "Остатки",
            except: SECTIONS.map((s) => href(`/warehouse/${s}`)),
          },
          { href: href("/warehouse/incoming"), label: "Приход" },
        ]
      : []),
    ...(ownCrews ? [{ href: href("/warehouse/outgoing"), label: "Расход" }] : []),
    ...(ownCrews ? [{ href: href("/warehouse/services"), label: "Услуги" }] : []),
    ...(stock || hasPermission(org, "norms.manage")
      ? [{ href: href("/warehouse/norms"), label: "Нормативы" }]
      : []),
    ...(stock ? [{ href: href("/warehouse/report"), label: "Отчёт" }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <SectionTabs tabs={tabs} label="Склад" />
      {children}
    </div>
  );
}
