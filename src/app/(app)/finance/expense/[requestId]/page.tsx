import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ExpenseForm } from "@/features/finance/components/expense-form";
import { listAccounts, listPaymentRequests } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Расход" };

export default async function ExpenseRequestPage({
  params,
}: PageProps<"/finance/expense/[requestId]">) {
  const org = await requirePermission("cash.post");
  const { requestId } = await params;
  const [requests, accounts] = await Promise.all([
    listPaymentRequests(org.id, ["APPROVED", "PARTIALLY_PAID"]),
    listAccounts(org.id, true),
  ]);
  const request = requests.find((r) => r.id === requestId);
  if (!request) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title={request.payee}
        description={`Счёт ${request.number} · ${request.basis ?? ""}`}
      />
      <ExpenseForm request={request} accounts={accounts} />
    </div>
  );
}
