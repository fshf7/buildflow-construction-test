import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

export default async function ProcurementLayout({
  children,
  params,
}: LayoutProps<"/objects/[projectId]/procurement">) {
  const { projectId } = await params;
  const org = await requireOrg();
  if (!hasAnyPermission(org, ["purchase_requests.view", "supplier_invoices.view"])) {
    redirect("/no-access?reason=forbidden");
  }
  const tabs = [
    ...(hasPermission(org, "purchase_requests.view")
      ? [{ href: objectHref(projectId, "/procurement/requests"), label: "Заявки" }]
      : []),
    ...(hasPermission(org, "supplier_invoices.view")
      ? [{ href: objectHref(projectId, "/procurement/invoices"), label: "Накладные" }]
      : []),
    ...(hasPermission(org, "goods_receipts.approve_correction")
      ? [{ href: objectHref(projectId, "/procurement/approvals"), label: "Согласования" }]
      : []),
  ];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionTabs tabs={tabs} label="Закупки" />
      {children}
    </div>
  );
}
