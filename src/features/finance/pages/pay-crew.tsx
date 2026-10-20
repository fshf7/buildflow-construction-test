import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PayDebtForm } from "@/features/finance/components/pay-debt-form";
import { listAccounts, listPayables } from "@/features/finance/queries";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Оплата бригаде" };

// BP-05: кассир оплачивает утверждённые акты полностью или частично; отклонённые сюда не попадают.
export default async function PayCrewPage({
  params,
}: {
  params: ScopedParams<{ crewId: string }>;
}) {
  const { org, scope } = await financeScope(params, "cash.post");
  const { crewId } = await params;
  const [payables, accounts] = await Promise.all([
    listPayables(org.id, { kind: "CREW", crew: crewId, project: scope.projectId, openOnly: true }),
    listAccounts(org.id, true, scope.projectId),
  ]);
  if (payables.length === 0) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title={payables[0]!.counterpartyName}
        description="Укажите, сколько платите по каждому утверждённому акту."
      />
      <PayDebtForm
        counterparty={{ kind: "CREW", id: crewId }}
        payables={payables}
        accounts={accounts}
      />
    </div>
  );
}
