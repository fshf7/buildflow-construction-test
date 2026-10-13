import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { PaymentRequestActions } from "@/features/finance/components/payment-request-actions";
import { PAYMENT_REQUEST_STATUS_LABELS, PURPOSE_LABELS } from "@/features/finance/labels";
import { getPaymentRequest } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Счёт на оплату" };

export default async function PaymentRequestPage({ params }: PageProps<"/finance/requests/[id]">) {
  const org = await requirePermission("payment_requests.view");
  const user = await requireUser();
  const { id } = await params;
  const r = await getPaymentRequest(id);
  if (!r) notFound();
  const approvePerm =
    r.purpose === "OTHER_EXPENSE" ? "payment_requests.approve" : "payment_requests.approve_payroll";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title={r.number ? `Счёт ${r.number}` : "Счёт (черновик)"}
        description={`${PURPOSE_LABELS[r.purpose]} · ${formatDate(r.docDate)}`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{PAYMENT_REQUEST_STATUS_LABELS[r.status]}</Badge>
        {r.statusComment ? (
          <span className="text-muted-foreground">Комментарий: {r.statusComment}</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Получатель</dt>
        <dd>{r.payeeName}</dd>
        <dt className="text-muted-foreground">Основание</dt>
        <dd>{r.basis}</dd>
        <dt className="text-muted-foreground">Сумма</dt>
        <dd>{formatMoney(r.amount, r.currency)}</dd>
        <dt className="text-muted-foreground">Оплачено</dt>
        <dd>{formatMoney(r.paid, r.currency)}</dd>
        <dt className="text-muted-foreground">К оплате</dt>
        <dd>
          <b>{formatMoney(r.remaining, r.currency)}</b>
        </dd>
      </dl>
      <PaymentRequestActions
        id={r.id}
        status={r.status}
        canCreate={hasPermission(org, "payment_requests.create")}
        canApprove={hasPermission(org, approvePerm)}
        isAuthor={r.createdBy === user.id}
        hasNumber={Boolean(r.number)}
        paid={r.paid}
      />
      {r.payments.length > 0 ? (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">Оплаты</h2>
          {r.payments.map((p) => (
            <Link
              key={p.id}
              href={`/finance/operations/${p.transactionId}`}
              className="underline underline-offset-4"
            >
              {p.number} от {formatDate(p.docDate)} — {formatMoney(p.amount, r.currency)}
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
