import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PaymentRequestForm } from "@/features/finance/components/payment-request-form";
import { listCrewOptions } from "@/features/shared/lookups";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Новый счёт на оплату" };

export default async function NewPaymentRequestPage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params, "payment_requests.create");
  const crews = await listCrewOptions(org.id);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title="Новый счёт на оплату" description={scope.projectLabel ?? "Без объекта"} />
      <PaymentRequestForm crews={crews} />
    </div>
  );
}
