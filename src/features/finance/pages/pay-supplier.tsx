import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PayDebtForm } from "@/features/finance/components/pay-debt-form";
import { listAccounts, listPayables } from "@/features/finance/queries";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Оплата долга" };

export default async function PaySupplierPage({
  params,
}: {
  params: ScopedParams<{ supplierId: string }>;
}) {
  const { org, scope } = await financeScope(params, "cash.post");
  const { supplierId } = await params;
  const [payables, accounts] = await Promise.all([
    listPayables(org.id, { supplier: supplierId, project: scope.projectId, openOnly: true }),
    listAccounts(org.id, true, scope.projectId),
  ]);
  if (payables.length === 0) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title={payables[0]!.supplierName}
        description="Укажите, сколько платите по каждому обязательству."
      />
      <PayDebtForm
        counterparty={{ kind: "SUPPLIER", id: supplierId }}
        payables={payables}
        accounts={accounts}
      />
    </div>
  );
}
