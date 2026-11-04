import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PagedPager, PageSlice } from "@/components/pagination";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { serviceReconciliation, serviceReconDetail } from "@/features/procurement/queries";
import { RECON_LABELS, reconcile } from "@/features/procurement/service-recon";
import { requireObject } from "@/features/projects/object";
import { ReportPeriod } from "@/features/warehouse/components/report-period";
import { hasPermission } from "@/lib/auth/access-model";
import { businessToday, formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Сверка услуг" };

const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

const amountOf = (amount: number, currencies: string[]) =>
  currencies.length === 0
    ? "—"
    : currencies.length === 1
      ? formatMoney(amount, currencies[0])
      : "разные валюты";

/**
 * Сверка услуг (Д-112) — бухгалтер: по каждой услуге за период — использовано по журналу склада,
 * по согласованным заявкам, выставлено в накладных (строки-услуги), разница. По клику — строки,
 * из которых сложились числа. Только показывает расхождение, ничего не блокирует.
 * TODO(TZ-open): что делать при расхождении (кто решает, корректировка счёта или журнала).
 */
export default async function ServiceReconciliationPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/procurement/services">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.view");
  if (!hasPermission(org, "prices.view")) redirect("/no-access?reason=forbidden");
  const sp = await searchParams;
  const today = businessToday();
  const from = isoDate(sp.from) ?? `${today.slice(0, 8)}01`;
  const to = isoDate(sp.to) ?? today;
  const selected = typeof sp.service === "string" ? sp.service : undefined;
  const rows = await serviceReconciliation(project.id, from, to);
  const current = rows.find((r) => r.serviceId === selected);
  const detail = current ? await serviceReconDetail(project.id, current.serviceId, from, to) : null;
  const period = new URLSearchParams({
    ...(isoDate(sp.from) ? { from } : {}),
    ...(isoDate(sp.to) ? { to } : {}),
  });
  const serviceHref = (id: string) => {
    const q = new URLSearchParams(period);
    if (id !== selected) q.set("service", id);
    const s = q.toString();
    return `${objectHref(project.id, "/procurement/services")}${s ? `?${s}` : ""}`;
  };
  const issues = rows.filter((r) => reconcile(r.used, r.invoiced).status !== "ok").length;

  return (
    <>
      <PageHeader
        title="Сверка услуг"
        description={`${project.label} · журнал услуг склада ↔ строки-услуги накладных`}
        actions={
          <a
            href={`${objectHref(project.id, "/procurement/services/export")}?from=${from}&to=${to}`}
            className={buttonVariants({ variant: "outline" })}
            download
          >
            <Download />
            Excel
          </a>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "За период услуг нет"
            : issues === 0
              ? "Все услуги сходятся"
              : `С расхождением: ${issues} из ${rows.length}`}
        </span>
        <ReportPeriod from={from} to={to} />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Услуга</TableHead>
              <TableHead className="text-right">По журналу склада</TableHead>
              <TableHead className="text-right">По заявкам</TableHead>
              <TableHead className="text-right">В накладных</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead className="text-right">Разница</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                  За период нет ни строк журнала услуг, ни строк-услуг в накладных
                </TableCell>
              </TableRow>
            ) : (
              <PageSlice>
                {rows.map((r) => {
                  const { diff, status } = reconcile(r.used, r.invoiced);
                  return (
                    <TableRow
                      key={r.serviceId}
                      className={cn(r.serviceId === selected && "bg-primary/5")}
                    >
                      <TableCell>
                        <Link
                          href={serviceHref(r.serviceId)}
                          scroll={false}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.service}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(r.used, r.unit)}
                        <span className="block text-xs text-muted-foreground">
                          строк: {r.usedRows}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {r.requested ? formatQuantity(r.requested, r.unit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(r.invoiced, r.unit)}
                        <span className="block text-xs text-muted-foreground">
                          накладных: {r.invoices}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {amountOf(r.invoicedAmount, r.currencies)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          status === "over" && "font-medium text-destructive",
                          status === "under" && "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                        {formatQuantity(Math.abs(diff), r.unit)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            status === "ok" && "text-emerald-700 dark:text-emerald-400",
                            status === "over" && "font-medium text-destructive",
                            status === "under" && "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {RECON_LABELS[status]}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </PageSlice>
            )}
          </TableBody>
        </Table>
      </div>
      <PagedPager total={rows.length} />

      {current && detail ? (
        <section className="flex flex-col gap-3" aria-label={`Строки: ${current.service}`}>
          <h2 className="text-lg font-semibold">
            {current.service}: из чего сложилось ({formatDate(from)} — {formatDate(to)})
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Журнал услуг склада — {formatQuantity(current.used, current.unit)}
              </h3>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Дата</TableHead>
                      <TableHead className="text-right">Кол-во</TableHead>
                      <TableHead>Где, бригада</TableHead>
                      <TableHead>Заявка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.usages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-14 text-center text-muted-foreground">
                          Строк нет
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.usages.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{formatDate(u.date)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatQuantity(u.quantity, current.unit)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {[u.block, u.stage, u.crew].filter(Boolean).join(" · ")}
                          </TableCell>
                          <TableCell className="text-xs">{u.request}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Строки накладных — {formatQuantity(current.invoiced, current.unit)}
              </h3>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Накладная</TableHead>
                      <TableHead>Поставщик</TableHead>
                      <TableHead className="text-right">Кол-во</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-14 text-center text-muted-foreground">
                          Строк-услуг в накладных нет
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <Link
                              href={objectHref(project.id, `/procurement/invoices/${l.invoiceId}`)}
                              className="font-medium text-primary hover:underline"
                            >
                              {l.number}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              {formatDate(l.date)}
                            </span>
                          </TableCell>
                          <TableCell>{l.supplier}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatQuantity(l.quantity, current.unit)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {formatMoney(l.amount, l.currency)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Журнал — по дате строки, накладные — по дате накладной, заявки — по дате «когда нужно».
        Чтобы строка накладной попала в сверку, её наименование должно совпасть с услугой из
        справочника (подсказка «услуга» при вводе). Расхождение ничего не блокирует — это подсказка
        для проверки счёта.
      </p>
    </>
  );
}
