import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SectionTabs } from "@/components/section-tabs";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

import { FinanceScopeProvider } from "../components/finance-scope";
import { financeScope, type ScopedParams } from "../scope";

/** Раздел финансов — внутри объекта и в «Общем» (касса без объекта), Д-94. */
export default async function FinanceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: ScopedParams;
}) {
  const { org, scope } = await financeScope(params);
  const common = scope.projectId === null;
  if (
    !hasAnyPermission(org, [
      "cash.view",
      "payables.view",
      "payment_requests.view",
      ...(common ? (["cash_accounts.manage", "cash.reversals_report"] as const) : []),
    ])
  ) {
    redirect("/no-access?reason=forbidden");
  }
  const tab = (path: string, label: string) => ({ href: `${scope.base}${path}`, label });
  const tabs = [
    ...(hasAnyPermission(org, ["cash.view", "cash_accounts.manage"])
      ? [tab("/cash", common ? "Кассы" : "Касса")]
      : []),
    ...(hasPermission(org, "payables.view") ? [tab("/payables", "Долги поставщикам")] : []),
    ...(hasPermission(org, "cash.view") ? [tab("/operations", "Операции")] : []),
    ...(hasPermission(org, "payment_requests.view") ? [tab("/requests", "Счета на оплату")] : []),
    ...(common && hasPermission(org, "cash.reversals_report")
      ? [tab("/reversals", "Сторно за период")]
      : []),
  ];
  return (
    <FinanceScopeProvider scope={{ projectId: scope.projectId, base: scope.base }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        {common ? (
          <p className="text-sm text-muted-foreground">
            Касса без объекта: общие кассы и счета, средства владельца, общие расходы. Операции и
            долги объектов — внутри объектов.
          </p>
        ) : null}
        <SectionTabs tabs={tabs} label="Финансы" />
        {children}
      </div>
    </FinanceScopeProvider>
  );
}
