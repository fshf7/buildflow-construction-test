import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireObject } from "@/features/projects/object";
import { ReportPeriod } from "@/features/warehouse/components/report-period";
import { normStatus, warehouseReport } from "@/features/warehouse/sheets";
import { businessToday, formatDate, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Отчёт по складу" };

const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[70vh] overflow-auto rounded-lg border">{children}</div>;
}

const VIEWS = [
  { value: "incoming", label: "Приход" },
  { value: "outgoing", label: "Расход" },
  { value: "balance", label: "Остаток" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const empty = (cols: number) => (
  <TableRow>
    <TableCell colSpan={cols} className="h-16 text-center text-muted-foreground">
      За период ничего нет
    </TableCell>
  </TableRow>
);

/**
 * Отчёт по складу за период (Д-100) — как их лист «Отчёт»: приход за период; расход по блокам и
 * этапам с нормативом и статусом; остаток на конец периода (приход всего, расход всего, остаток).
 * Д-106: три отчёта — вкладками (?view=), на экране один; период — в той же строке.
 */
export default async function WarehouseReportPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/report">) {
  const { projectId } = await params;
  const { project } = await requireObject(projectId, "stock.view");
  const sp = await searchParams;
  const today = businessToday();
  const from = isoDate(sp.from) ?? `${today.slice(0, 8)}01`;
  const to = isoDate(sp.to) ?? today;
  const report = await warehouseReport(project.id, from, to);
  const qty = (v: number) => formatQuantity(Math.round(v * 10000) / 10000);
  const view: View = VIEWS.find((v) => v.value === sp.view)?.value ?? "incoming";
  const overspent = report.outgoing.filter(
    (r) => normStatus(r.norm, r.normIssued) === "Перерасход",
  ).length;
  const counts: Record<View, number> = {
    incoming: report.incoming.length,
    outgoing: report.outgoing.length,
    balance: report.balance.length,
  };
  // Вкладка сохраняет выбранный период.
  const viewHref = (v: View) =>
    `?${new URLSearchParams({
      view: v,
      ...(isoDate(sp.from) ? { from } : {}),
      ...(isoDate(sp.to) ? { to } : {}),
    }).toString()}`;

  return (
    <>
      <PageHeader
        title="Отчёт по складу"
        description={project.label}
        actions={
          <a
            href={`${objectHref(project.id, "/warehouse/export")}?sheet=report&from=${from}&to=${to}`}
            className={buttonVariants({ variant: "outline" })}
            download
          >
            <Download />
            Excel
          </a>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Отчёты склада"
          className="flex max-w-full [scrollbar-width:none] gap-1 overflow-x-auto"
        >
          {VIEWS.map((v) => {
            const active = v.value === view;
            return (
              <Link
                key={v.value}
                href={viewHref(v.value)}
                replace
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {v.label}
                <span className="text-xs tabular-nums opacity-70">{counts[v.value]}</span>
                {v.value === "outgoing" && overspent > 0 ? (
                  <span
                    className="rounded-full bg-destructive px-1.5 text-xs font-medium text-white"
                    title="Строк с перерасходом норматива"
                  >
                    {overspent}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <ReportPeriod from={from} to={to} />
      </div>

      {view === "incoming" ? (
        <Panel>
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead>Материал</TableHead>
                <TableHead>Ед. изм.</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.incoming.length === 0
                ? empty(3)
                : report.incoming.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.material}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.quantity)}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      {view === "outgoing" ? (
        <Panel>
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead>Материал</TableHead>
                <TableHead>Блок</TableHead>
                <TableHead>Этаж</TableHead>
                <TableHead>Этап работ</TableHead>
                <TableHead className="text-right">Расход</TableHead>
                <TableHead className="text-right">Норматив</TableHead>
                <TableHead className="text-right">Отклонение</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.outgoing.length === 0
                ? empty(8)
                : report.outgoing.map((r, i) => {
                    const status = normStatus(r.norm, r.normIssued);
                    const deviation =
                      r.norm !== null && r.normIssued !== null ? r.normIssued - r.norm : null;
                    return (
                      <TableRow key={i}>
                        <TableCell>{r.material}</TableCell>
                        <TableCell>{r.block}</TableCell>
                        <TableCell>{r.floor}</TableCell>
                        <TableCell>{r.stage}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {qty(r.quantity)} {r.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.norm !== null ? qty(r.norm) : ""}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            deviation !== null && deviation > 0 && "font-medium text-destructive",
                          )}
                        >
                          {deviation !== null ? qty(deviation) : ""}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              status === "Перерасход" && "font-medium text-destructive",
                              status === "В норме" && "text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      {view === "balance" ? (
        <Panel>
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead>Материал</TableHead>
                <TableHead>Ед. изм.</TableHead>
                <TableHead className="text-right">Приход всего</TableHead>
                <TableHead className="text-right">Расход всего</TableHead>
                <TableHead className="text-right">Остаток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.balance.length === 0
                ? empty(5)
                : report.balance.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.material}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.incoming)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.outgoing)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {qty(r.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {view === "balance"
          ? `Остаток на ${formatDate(to)}: приход и расход — с начала учёта.`
          : `За период с ${formatDate(from)} по ${formatDate(to)}.`}{" "}
        В Excel — все три отчёта.
      </p>
    </>
  );
}
