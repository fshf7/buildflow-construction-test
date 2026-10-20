import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PURPOSE_LABELS } from "@/features/finance/labels";
import { listPaymentRequests } from "@/features/finance/queries";
import { hasPermission } from "@/lib/auth/access-model";
import { formatMoney } from "@/lib/format";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Расход" };

// Расход без накладной — только по согласованному счёту на оплату (Д-13).
// Материалы и услуги по накладным оплачиваются через «Оплатить долг».
export default async function ExpensePage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params, "cash.post");
  const requests = await listPaymentRequests(org.id, scope.projectId, [
    "APPROVED",
    "PARTIALLY_PAID",
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title="Расход по счёту"
        description="Прочие расходы, зарплаты и выплаты вне актов — по согласованному счёту."
      />
      {requests.length === 0 ? (
        <p className="text-muted-foreground">Согласованных счетов к оплате нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`${scope.base}/expense/${r.id}`}
                className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-semibold">{r.payee}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.number} · {PURPOSE_LABELS[r.purpose]}
                  </span>
                  <span className="text-sm">К оплате: {formatMoney(r.remaining, r.currency)}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasPermission(org, "payment_requests.create") ? (
        <Link
          href={`${scope.base}/requests/new`}
          className={buttonVariants({ variant: "outline" })}
        >
          Новый счёт на оплату
        </Link>
      ) : null}
    </div>
  );
}
