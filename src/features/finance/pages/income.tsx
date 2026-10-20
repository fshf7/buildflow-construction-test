import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { IncomeForm } from "@/features/finance/components/income-form";
import { listAccounts } from "@/features/finance/queries";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Приход" };

// Д-94: приход по объекту — в объекте; средства владельца и прочее без объекта — в «Общем».
export default async function IncomePage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params, "cash.post");
  const accounts = await listAccounts(org.id, true, scope.projectId);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title="Приход" description={scope.projectLabel ?? "Без объекта"} />
      <IncomeForm accounts={accounts} />
    </div>
  );
}
