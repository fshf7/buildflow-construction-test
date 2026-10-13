import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PAYABLE_STATUS_LABELS } from "@/features/finance/labels";
import { groupBySupplier, listPayables, listPayments } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Долг поставщику" };

export default async function SupplierPayablesPage({
  params,
}: PageProps<"/finance/payables/[supplierId]">) {
  const org = await requirePermission("payables.view");
  const { supplierId } = await params;
  const rows = await listPayables(org.id, { supplier: supplierId });
  if (rows.length === 0) notFound();
  const payments = await listPayments(rows.map((r) => r.id));
  const total = groupBySupplier(rows);

  return (
    <>
      <PageHeader
        title={rows[0]!.supplierName}
        description={total
          .map(
            (t) =>
              `Начислено ${formatMoney(t.amount, t.currency)} · оплачено ${formatMoney(t.paid, t.currency)} · долг ${formatMoney(t.remaining, t.currency)}`,
          )
          .join("; ")}
        actions={
          hasPermission(org, "cash.post") &&
          rows.some((r) => r.remaining > 0 && r.status !== "CANCELLED") ? (
            <Link href={`/finance/pay/${supplierId}`} className={buttonVariants()}>
              Оплатить
            </Link>
          ) : null
        }
      />
      <ul className="flex flex-col gap-3">
        {rows.map((p) => {
          const own = payments.filter((x) => x.payableId === p.id);
          return (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {p.sourceHref ? (
                  <Link href={p.sourceHref} className="font-medium underline underline-offset-4">
                    {p.source}
                  </Link>
                ) : (
                  <span className="font-medium">{p.source}</span>
                )}
                <Badge variant={p.status === "PAID" ? "outline" : "secondary"}>
                  {PAYABLE_STATUS_LABELS[p.status]}
                </Badge>
              </div>
              <p className="text-sm">
                Сумма {formatMoney(p.amount, p.currency)} · оплачено{" "}
                {formatMoney(p.paid, p.currency)} ·{" "}
                <b>долг {formatMoney(p.remaining, p.currency)}</b>
                {p.projectLabel ? ` · ${p.projectLabel}` : ""}
                {p.dueDate ? ` · срок ${formatDate(p.dueDate)}` : ""}
              </p>
              {own.length > 0 ? (
                <ul className="flex flex-col gap-1 border-t pt-2 text-sm">
                  {own.map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`/finance/operations/${x.transactionId}`}
                        className="underline underline-offset-4"
                      >
                        {x.number}
                      </Link>{" "}
                      от {formatDate(x.docDate)} — {formatMoney(x.amount, x.currency)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
