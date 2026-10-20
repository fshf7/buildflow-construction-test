import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

/** Склад (Д-98): заявки склада, остатки (с приёмкой, выдачей, возвратом) и журнал. */
export default async function WarehouseLayout({
  children,
  params,
}: LayoutProps<"/objects/[projectId]/warehouse">) {
  const { projectId } = await params;
  const org = await requireOrg();
  if (!hasAnyPermission(org, ["purchase_requests.view", "stock.view", "stock.view_own_crews"]))
    redirect("/no-access?reason=forbidden");
  const href = (path: string) => objectHref(projectId, path);
  const tabs = [
    ...(hasPermission(org, "purchase_requests.view")
      ? [{ href: href("/warehouse/requests"), label: "Заявки склада" }]
      : []),
    ...(hasPermission(org, "stock.view")
      ? [
          {
            href: href("/warehouse"),
            label: "Остатки",
            except: [href("/warehouse/requests"), href("/warehouse/journal")],
          },
        ]
      : []),
    ...(hasAnyPermission(org, ["stock.view", "stock.view_own_crews"])
      ? [{ href: href("/warehouse/journal"), label: "Журнал склада" }]
      : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <SectionTabs tabs={tabs} label="Склад" />
      {children}
    </div>
  );
}
