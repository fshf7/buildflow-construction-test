import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PaymentRequestForm } from "@/features/finance/components/payment-request-form";
import { listCrewOptions, listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Новый счёт на оплату" };

export default async function NewPaymentRequestPage() {
  const org = await requirePermission("payment_requests.create");
  const [crews, projects] = await Promise.all([
    listCrewOptions(org.id),
    listProjectOptions(org.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title="Новый счёт на оплату" />
      <PaymentRequestForm crews={crews} projects={projects} />
    </div>
  );
}
