"use client";

import { Download, Filter } from "lucide-react";
import { useMemo, useState } from "react";

import { useObjectHref } from "@/components/object-context";
import { Pager, usePagination } from "@/components/pagination";
import { ObjectLink } from "@/components/object-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { colorPill } from "@/features/catalog/expense-colors";
import type { Option } from "@/features/shared/lookups";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  currencyLabel,
  EXPENSE_CURRENCIES,
  filterExpenseRows,
  totalsByCurrency,
  type ExpenseFilters,
  type ExpenseRow,
} from "../expenses";

export type ExpenseCategoryOption = { id: string; name: string; color: string };

const filterInput = "h-8 w-full rounded-md border bg-background px-2 text-xs font-normal";

/**
 * Журнал затрат объекта (Д-99) — только просмотр: строки всех накладных. Фильтры в заголовке,
 * итоги по валютам, выгрузка в Excel. Вводят и исправляют — в накладной (ссылка в колонке).
 */
export function ExpensesTable({
  rows,
  categories,
  suppliers,
  withPrices,
}: {
  rows: ExpenseRow[];
  categories: ExpenseCategoryOption[];
  suppliers: Option[];
  withPrices: boolean;
}) {
  const href = useObjectHref();
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const visible = useMemo(() => filterExpenseRows(rows, filters), [rows, filters]);
  const totals = totalsByCurrency(visible);
  // Д-108: по 30 строк; итоги — по всем отфильтрованным строкам.
  const paging = usePagination(visible.length, { scrollTarget: "expenses-table" });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const filtered = Object.values(filters).some(Boolean);
  const setFilter = (patch: Partial<ExpenseFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    paging.resetPage();
  };
  const exportQuery = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => [k, String(v)]),
  ).toString();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={showFilters || filtered ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter />
          Фильтры{filtered ? " (включены)" : ""}
        </Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              paging.resetPage();
            }}
          >
            Сбросить
          </Button>
        ) : null}
        <a
          href={`${href("/procurement/expenses/export")}${exportQuery ? `?${exportQuery}` : ""}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          download
        >
          <Download />
          Excel
        </a>
        <span className="ml-auto text-sm text-muted-foreground">
          Строк: {visible.length}
          {totals.map((t) => (
            <b key={t.currency} className="ml-3 text-foreground tabular-nums">
              {formatAmount(t.total)} {currencyLabel(t.currency)}
            </b>
          ))}
        </span>
      </div>

      <div id="expenses-table" className="max-h-[70vh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-[1] bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Дата</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead>Ед. изм.</TableHead>
              {withPrices ? (
                <>
                  <TableHead className="text-right">Цена за ед.</TableHead>
                  <TableHead>Валюта</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </>
              ) : null}
              <TableHead>Поставщик</TableHead>
              <TableHead>Накладная</TableHead>
            </TableRow>
            {showFilters ? (
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="py-1.5">
                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      aria-label="С даты"
                      className={filterInput}
                      value={filters.from ?? ""}
                      onChange={(e) => setFilter({ from: e.target.value || undefined })}
                    />
                    <input
                      type="date"
                      aria-label="По дату"
                      className={filterInput}
                      value={filters.to ?? ""}
                      onChange={(e) => setFilter({ to: e.target.value || undefined })}
                    />
                  </div>
                </TableHead>
                <TableHead className="py-1.5">
                  <input
                    aria-label="Поиск"
                    placeholder="Наименование, поставщик, №"
                    className={filterInput}
                    value={filters.text ?? ""}
                    onChange={(e) => setFilter({ text: e.target.value || undefined })}
                  />
                </TableHead>
                <TableHead className="py-1.5">
                  <select
                    aria-label="Фильтр по категории"
                    className={filterInput}
                    value={filters.categoryId ?? ""}
                    onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
                  >
                    <option value="">Все</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </TableHead>
                <TableHead />
                <TableHead />
                {withPrices ? (
                  <>
                    <TableHead />
                    <TableHead className="py-1.5">
                      <select
                        aria-label="Фильтр по валюте"
                        className={filterInput}
                        value={filters.currency ?? ""}
                        onChange={(e) => setFilter({ currency: e.target.value || undefined })}
                      >
                        <option value="">Все</option>
                        {EXPENSE_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </TableHead>
                    <TableHead />
                  </>
                ) : null}
                <TableHead className="py-1.5">
                  <select
                    aria-label="Фильтр по поставщику"
                    className={filterInput}
                    value={filters.supplierId ?? ""}
                    onChange={(e) => setFilter({ supplierId: e.target.value || undefined })}
                  >
                    <option value="">Все</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </TableHead>
                <TableHead className="py-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.showCancelled)}
                      onChange={(e) => setFilter({ showCancelled: e.target.checked || undefined })}
                    />
                    Отменённые
                  </label>
                </TableHead>
              </TableRow>
            ) : null}
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                  {filtered
                    ? "По фильтру ничего не найдено"
                    : "Затрат пока нет — оформите накладную"}
                </TableCell>
              </TableRow>
            ) : (
              paging.slice(visible).map((r) => {
                const category = r.categoryId ? categoryById.get(r.categoryId) : undefined;
                return (
                  <TableRow
                    key={r.key}
                    className={cn(r.status === "CANCELLED" && "text-muted-foreground line-through")}
                  >
                    <TableCell>{formatDate(r.docDate)}</TableCell>
                    <TableCell className="whitespace-normal">{r.description}</TableCell>
                    <TableCell>
                      {category ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            colorPill(category.color),
                          )}
                        >
                          {category.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(r.quantity)}
                    </TableCell>
                    <TableCell>{r.unitCode}</TableCell>
                    {withPrices ? (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(r.price ?? 0)}
                        </TableCell>
                        <TableCell>{currencyLabel(r.currency)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(r.amount ?? 0)}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell>
                      <ObjectLink
                        path={`/procurement/invoices/${r.invoiceId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.number ?? "Черновик"}
                      </ObjectLink>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <Pager paging={paging} />
    </div>
  );
}
