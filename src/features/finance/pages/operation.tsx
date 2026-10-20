import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { RequestReversal, ReversalDecision } from "@/features/finance/components/operation-actions";
import { CASH_STATUS_LABELS, CATEGORY_LABELS } from "@/features/finance/labels";
import { getOperation, listPayables } from "@/features/finance/queries";
import { hasPermission } from "@/lib/auth/access-model";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

import { ensureFinanceDoc, financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Операция" };

export default async function OperationPage({ params }: { params: ScopedParams<{ id: string }> }) {
  const { org, scope } = await financeScope(params, "cash.view");
  const user = await requireUser();
  const { id } = await params;
  const op = await getOperation(id);
  if (!op) notFound();
  ensureFinanceDoc(scope, op.projectId, `/operations/${id}`);
  const payables = op.allocations.some((a) => a.payableId) ? await listPayables(org.id, {}) : [];
  const title =
    op.kind === "OPENING"
      ? "Начальный остаток"
      : `${op.direction === "IN" ? "Приход" : "Расход"} ${op.number ?? "(черновик)"}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title={title} description={`${op.accountName} · ${formatDate(op.docDate)}`} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={op.status === "POSTED" ? "default" : "secondary"}>
          {CASH_STATUS_LABELS[op.status]}
        </Badge>
        <span>
          {op.kind === "REVERSAL"
            ? `Сторно: ${CATEGORY_LABELS[op.category]}`
            : CATEGORY_LABELS[op.category]}
        </span>
      </div>
      <p className="text-3xl font-semibold tabular-nums">
        {op.direction === "IN" ? "+" : "−"}
        {formatMoney(op.amount, op.currency)}
      </p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        {op.counterparty ? (
          <>
            <dt className="text-muted-foreground">Контрагент</dt>
            <dd>{op.counterparty}</dd>
          </>
        ) : null}
        {op.basis ? (
          <>
            <dt className="text-muted-foreground">Основание</dt>
            <dd>{op.basis}</dd>
          </>
        ) : null}
        {op.projectLabel ? (
          <>
            <dt className="text-muted-foreground">Объект</dt>
            <dd>{op.projectLabel}</dd>
          </>
        ) : null}
        {op.cancelReason ? (
          <>
            <dt className="text-muted-foreground">Причина сторно</dt>
            <dd>{op.cancelReason}</dd>
          </>
        ) : null}
      </dl>
      {op.reversalOfId ? (
        <Link
          href={`${scope.base}/operations/${op.reversalOfId}`}
          className="text-sm underline underline-offset-4"
        >
          ← Сторнируемая операция
        </Link>
      ) : null}
      {op.reversedBy ? (
        <Link
          href={`${scope.base}/operations/${op.reversedBy.id}`}
          className="text-sm underline underline-offset-4"
        >
          Сторно: {op.reversedBy.number} →
        </Link>
      ) : null}

      {op.allocations.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Что оплачено</h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {op.allocations.map((a) => {
              const p = payables.find((x) => x.id === a.payableId);
              return (
                <li key={a.id} className="flex justify-between gap-3 p-3">
                  <span>
                    {p ? (
                      <>
                        {p.source}
                        <span className="block text-xs text-muted-foreground">
                          Остаток долга сейчас: {formatMoney(p.remaining, p.currency)}
                        </span>
                      </>
                    ) : a.paymentRequestId ? (
                      <Link
                        href={`${scope.base}/requests/${a.paymentRequestId}`}
                        className="underline underline-offset-4"
                      >
                        Счёт на оплату
                      </Link>
                    ) : null}
                  </span>
                  <b className="tabular-nums">{formatMoney(a.amount, op.currency)}</b>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Д-67: кассир запрашивает сторно, бухгалтер (≠ инициатор) согласует. */}
      {op.status === "POSTED" && op.kind === "REGULAR" && op.reversalRequest ? (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p>
            <b>Сторно запрошено</b>
            {op.reversalRequest.byName
              ? ` (${op.reversalRequest.byName}, ${formatDateTime(op.reversalRequest.at)})`
              : ""}
            : {op.reversalRequest.reason}
          </p>
          {hasPermission(org, "cash.reverse_approve") && op.reversalRequest.by !== user.id ? (
            <ReversalDecision id={op.id} />
          ) : (
            <p>Ожидает решения бухгалтера.</p>
          )}
        </section>
      ) : null}
      {op.status === "POSTED" &&
      op.kind === "REGULAR" &&
      !op.reversalRequest &&
      hasPermission(org, "cash.reverse") ? (
        <RequestReversal id={op.id} />
      ) : null}
    </div>
  );
}
