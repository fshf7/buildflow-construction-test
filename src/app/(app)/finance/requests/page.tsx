import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PaymentRequestsTable } from "@/features/finance/components/finance-tables";
import { listPaymentRequests } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Счета на оплату" };

export default async function PaymentRequestsPage() {
  const org = await requirePermission("payment_requests.view");
  const rows = await listPaymentRequests(org.id);
  return (
    <>
      <PageHeader
        title="Счета на оплату"
        description="Прочие расходы без накладной, зарплаты и выплаты вне актов. Материалы и услуги по накладным — через долги поставщикам."
        actions={
          hasPermission(org, "payment_requests.create") ? (
            <Link href="/finance/requests/new" className={buttonVariants()}>
              Новый счёт
            </Link>
          ) : null
        }
      />
      <PaymentRequestsTable rows={rows} />
    </>
  );
}
