import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { PagedPager, PageSlice } from "@/components/pagination";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions, listResponsibleOptions } from "@/features/shared/lookups";
import {
  buildLedger,
  filterLedger,
  LEDGER_KINDS,
  ledgerTotals,
  type LedgerEntry,
  type LedgerFilter,
} from "@/features/warehouse/ledger";
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
 * Фильтры (Д-105): период, операция, бригада, блок, номер — в адресе страницы; итоги и остаток
 * на начало/конец периода.
 * Остаток = Σ движений (источник истины — stock_movements, §6.4).
 */
export default async function MaterialStockPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/stock/[materialId]">) {
  const { projectId, materialId } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(k) ?? "") ? str(k) : undefined);
  const showAll = str("all") === "1";
  const f: LedgerFilter = {
    from: date("from"),
    to: date("to"),
    kind: str("kind"),
    crew: str("crew"),
    block: str("block"),
    q: str("q"),
  };
  const { org, project } = await requireObject(projectId, "stock.view");
  const [balances, data, crews, blocks] = await Promise.all([
    listBalances(project.id),
    getMaterialLedgerData(project.id, materialId),
    listResponsibleOptions(org.id),
    listBlockOptions(project.id),
  ]);
  const balance = balances.find((b) => b.materialId === materialId);
  if (!balance) notFound();
  const { entries: all, hidden } = buildLedger(
    data.movements,
    data.docs,
    balance.quantity,
    showAll,
  );
  const entries = filterLedger(all, f);
  const totals = ledgerTotals(entries, all, balance.quantity, f);
  const filtered = Object.values(f).some(Boolean);
  const qty = (v: number) => formatQuantity(Math.abs(v), balance.unit);
  // Переключатель журнала сохраняет фильтры.
  const toggle = new URLSearchParams(
    Object.entries({ ...f, all: showAll ? undefined : "1" }).flatMap(([k, v]) =>
      v ? [[k, v]] : [],
    ),
  ).toString();
  const toggleHref = `${objectHref(project.id, `/warehouse/stock/${materialId}`)}${toggle ? `?${toggle}` : ""}`;

  return (
    <>
      <PageHeader
        title={balance.name}
        description={`${project.label} · остаток ${formatQuantity(balance.quantity, balance.unit)}`}
      />
      <FiltersBar
        fields={[
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
          { name: "kind", label: "Операция", type: "select", options: LEDGER_KINDS },
          {
            name: "crew",
            label: "Бригада",
            type: "select",
            options: crews.map((c) => ({ value: c.id, label: c.label })),
          },
          {
            name: "block",
            label: "Блок",
            type: "select",
            options: blocks.map((b) => ({ value: b.id, label: b.name })),
          },
          { name: "q", label: "Документ", type: "search", placeholder: "ПРМ-… / ВДЧ-…" },
        ]}
      />
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {totals.start !== null ? (
          <Total label="На начало" value={formatQuantity(totals.start, balance.unit)} />
        ) : null}
        <Total label="Приход" value={`+${qty(totals.received)}`} />
        <Total label="Выдано" value={`−${qty(totals.issued)}`} />
        <Total label="Возвращено" value={`+${qty(totals.returned)}`} />
        {totals.end !== null ? (
          <Total label="На конец" value={formatQuantity(totals.end, balance.unit)} strong />
        ) : null}
      </dl>
      {hidden > 0 ? (
        <Link
          href={toggleHref}
          className="self-start text-sm text-primary underline-offset-4 hover:underline"
        >
          {showAll ? "Скрыть исправления и отмены" : `Показать исправления и отмены (${hidden})`}
        </Link>
      ) : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {entries.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {filtered ? "По фильтрам ничего не найдено" : "Движений пока нет"}
          </li>
        ) : null}
        <PageSlice>
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
        </PageSlice>
      </ul>
      <PagedPager total={entries.length} />
    </>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}
