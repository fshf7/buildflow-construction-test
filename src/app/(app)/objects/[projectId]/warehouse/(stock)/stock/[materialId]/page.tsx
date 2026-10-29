import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { buildLedger, type LedgerEntry } from "@/features/warehouse/ledger";
import { getMaterialLedgerData, listBalances } from "@/features/warehouse/queries";
import { formatDate, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Движение материала" };

const STATUS: Record<NonNullable<LedgerEntry["status"]>, string> = {
  corrected: "исправлена",
  cancelled: "отменена",
  reversal: "сторно",
};

/**
 * Карточка материала (Д-104): одна строка на документ и остаток после неё. Исправления и отмены
 * (документ + его сторно) свёрнуты; «Показать исправления и отмены» — полный журнал движений.
 * Остаток = Σ движений (источник истины — stock_movements, §6.4).
 */
export default async function MaterialStockPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/stock/[materialId]">) {
  const { projectId, materialId } = await params;
  const showAll = (await searchParams).all === "1";
  const { project } = await requireObject(projectId, "stock.view");
  const [balances, data] = await Promise.all([
    listBalances(project.id),
    getMaterialLedgerData(project.id, materialId),
  ]);
  const balance = balances.find((b) => b.materialId === materialId);
  if (!balance) notFound();
  const { entries, hidden } = buildLedger(data.movements, data.docs, balance.quantity, showAll);
  const base = objectHref(project.id, `/warehouse/stock/${materialId}`);
  const qty = (v: number) => formatQuantity(Math.abs(v), balance.unit);

  return (
    <>
      <PageHeader
        title={balance.name}
        description={`${project.label} · остаток ${formatQuantity(balance.quantity, balance.unit)}`}
      />
      {hidden > 0 ? (
        <Link
          href={showAll ? base : `${base}?all=1`}
          className="self-start text-sm text-primary underline-offset-4 hover:underline"
        >
          {showAll ? "Скрыть исправления и отмены" : `Показать исправления и отмены (${hidden})`}
        </Link>
      ) : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {entries.map((e) => {
          const off = e.status !== null; // в полном журнале: исправленное, отменённое, сторно
          const title = e.href ? (
            <Link
              href={objectHref(project.id, e.href)}
              className="underline-offset-4 hover:underline"
            >
              {e.title}
            </Link>
          ) : (
            e.title
          );
          return (
            <li
              key={e.id}
              className={cn(
                "flex items-center justify-between gap-3 p-3 text-sm",
                off && "bg-muted/50 text-muted-foreground",
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("font-medium", off && "font-normal")}>
                  {title}
                  {e.status ? <span className="text-xs"> · {STATUS[e.status]}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    formatDate(e.date),
                    e.detail,
                    e.was !== null && `исправлено, было ${qty(e.was)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    !off && e.quantity > 0 && "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {e.quantity > 0 ? "+" : "−"}
                  {qty(e.quantity)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  остаток {formatQuantity(e.balanceAfter, balance.unit)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
