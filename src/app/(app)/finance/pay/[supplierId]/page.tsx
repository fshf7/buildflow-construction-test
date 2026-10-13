import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PayDebtForm } from "@/features/finance/components/pay-debt-form";
import { listAccounts, listPayables } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Оплата долга" };

export default async function PaySupplierPage({ params }: PageProps<"/finance/pay/[supplierId]">) {
  const org = await requirePermission("cash.post");
  const { supplierId } = await params;
  const [payables, accounts] = await Promise.all([
    listPayables(org.id, { supplier: supplierId, openOnly: true }),
    listAccounts(org.id, true),
  ]);
  if (payables.length === 0) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title={payables[0]!.supplierName}
        description="Укажите, сколько платите по каждому обязательству."
      />
      <PayDebtForm supplierId={supplierId} payables={payables} accounts={accounts} />
    </div>
  );
}
