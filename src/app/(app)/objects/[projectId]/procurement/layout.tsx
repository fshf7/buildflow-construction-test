import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

/** Закупки объекта (Д-99): новая накладная, журнал накладных, затраты, сверка услуг, согласования. */
export default async function ProcurementLayout({
  children,
  params,
}: LayoutProps<"/objects/[projectId]/procurement">) {
  const { projectId } = await params;
  const org = await requireOrg();
  if (!hasAnyPermission(org, ["supplier_invoices.view", "goods_receipts.approve_correction"])) {
    redirect("/no-access?reason=forbidden");
  }
  const href = (path: string) => objectHref(projectId, path);
  const canView = hasPermission(org, "supplier_invoices.view");
  const tabs = [
    ...(hasPermission(org, "supplier_invoices.manage")
      ? [{ href: href("/procurement/invoices/new"), label: "Новая накладная" }]
      : []),
    ...(canView
      ? [
          {
            href: href("/procurement/invoices"),
            label: "Журнал накладных",
            except: [href("/procurement/invoices/new")],
          },
          { href: href("/procurement/expenses"), label: "Затраты" },
        ]
      : []),
    // Д-112: сверка журнала услуг склада со строками-услугами накладных (нужны цены).
    ...(canView && hasPermission(org, "prices.view")
      ? [{ href: href("/procurement/services"), label: "Сверка услуг" }]
      : []),
    ...(hasPermission(org, "goods_receipts.approve_correction")
      ? [{ href: href("/procurement/approvals"), label: "Согласования" }]
      : []),
  ];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionTabs tabs={tabs} label="Закупки" />
      {children}
    </div>
  );
}
