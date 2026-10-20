import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyLabel } from "@/features/procurement/expenses";
import { listInvoiceJournal } from "@/features/procurement/queries";
import { listFiltersSchema } from "@/features/procurement/schemas";
import { requireObject } from "@/features/projects/object";
import { listSupplierOptions } from "@/features/shared/lookups";
import { hasPermission } from "@/lib/auth/access-model";
import { formatAmount, formatDate } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Журнал накладных" };

function DebtState({ debt }: { debt: { amount: number; paid: number; status: string } | null }) {
  if (!debt) return <span className="text-muted-foreground">—</span>;
  if (debt.status === "PAID")
    return <span className="text-emerald-700 dark:text-emerald-400">Оплачена</span>;
  if (debt.paid > 0) return <span className="text-amber-700 dark:text-amber-400">Частично</span>;
  return <span>Долг</span>;
}

/** Журнал накладных объекта (Д-99): все сохранённые накладные с номерами, новые сверху. */
export default async function InvoiceJournalPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/procurement/invoices">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.view");
  const filters = listFiltersSchema.parse(await searchParams);
  const access = {
    prices: hasPermission(org, "prices.view"),
    debts: hasPermission(org, "payables.view"),
  };
  const [rows, suppliers] = await Promise.all([
    listInvoiceJournal(org.id, project.id, filters, access),
    listSupplierOptions(org.id),
  ]);
  const href = (path: string) => objectHref(project.id, path);

  return (
    <>
      <PageHeader
        title="Журнал накладных"
        description="Сохранённые накладные объекта. Сохранённая накладная — сразу долг поставщику у кассира."
        actions={
          hasPermission(org, "supplier_invoices.manage") ? (
            <Link href={href("/procurement/invoices/new")} className={buttonVariants()}>
              Новая накладная
            </Link>
          ) : null
        }
      />
      <FiltersBar
        fields={[
          { name: "q", label: "Номер", type: "search", placeholder: "НК-… или № поставщика" },
          {
            name: "supplier",
            label: "Поставщик",
            type: "select",
            options: suppliers.map((s) => ({ value: s.id, label: s.label })),
          },
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead>№ поставщика</TableHead>
              <TableHead className="text-right">Строк</TableHead>
              {access.prices ? (
                <>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Валюта</TableHead>
                </>
              ) : null}
              {access.debts ? <TableHead>Оплата</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                  Накладных пока нет
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const cancelled = r.status === "CANCELLED";
                return (
                  <TableRow key={r.id} className={cn(cancelled && "text-muted-foreground")}>
                    <TableCell>
                      <Link
                        href={href(`/procurement/invoices/${r.id}`)}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.number ?? "Черновик"}
                      </Link>
                      {cancelled ? (
                        <Badge variant="outline" className="ml-2">
                          Отменена
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatDate(r.docDate)}</TableCell>
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell>{r.docNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.linesCount}</TableCell>
                    {access.prices ? (
                      <>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(r.total ?? 0)}
                        </TableCell>
                        <TableCell>{currencyLabel(r.currency)}</TableCell>
                      </>
                    ) : null}
                    {access.debts ? (
                      <TableCell>{cancelled ? "—" : <DebtState debt={r.debt} />}</TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
