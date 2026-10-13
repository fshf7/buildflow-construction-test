import { redirect } from "next/navigation";

import { SectionTabs } from "@/components/section-tabs";
import { requireOrg } from "@/lib/auth/access";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const org = await requireOrg();
  if (
    !hasAnyPermission(org, [
      "cash.view",
      "payables.view",
      "payment_requests.view",
      "cash_accounts.manage",
    ])
  ) {
    redirect("/no-access?reason=forbidden");
  }
  const tabs = [
    ...(hasAnyPermission(org, ["cash.view", "cash_accounts.manage"])
      ? [{ href: "/finance/cash", label: "Кассы" }]
      : []),
    ...(hasPermission(org, "payables.view")
      ? [{ href: "/finance/payables", label: "Долги поставщикам" }]
      : []),
    ...(hasPermission(org, "cash.view")
      ? [{ href: "/finance/operations", label: "Операции" }]
      : []),
    ...(hasPermission(org, "payment_requests.view")
      ? [{ href: "/finance/requests", label: "Счета на оплату" }]
      : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <SectionTabs tabs={tabs} label="Финансы" />
      {children}
    </div>
  );
}
