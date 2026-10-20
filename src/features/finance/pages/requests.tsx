import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PaymentRequestsTable } from "@/features/finance/components/finance-tables";
import { listPaymentRequests } from "@/features/finance/queries";
import { hasPermission } from "@/lib/auth/access-model";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Счета на оплату" };

export default async function PaymentRequestsPage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params, "payment_requests.view");
  const rows = await listPaymentRequests(org.id, scope.projectId);
  return (
    <>
      <PageHeader
        title="Счета на оплату"
        description="Прочие расходы без накладной, зарплаты и выплаты вне актов. Материалы и услуги по накладным — через долги поставщикам."
        actions={
          hasPermission(org, "payment_requests.create") ? (
            <Link href={`${scope.base}/requests/new`} className={buttonVariants()}>
              Новый счёт
            </Link>
          ) : null
        }
      />
      <PaymentRequestsTable rows={rows} />
    </>
  );
}
