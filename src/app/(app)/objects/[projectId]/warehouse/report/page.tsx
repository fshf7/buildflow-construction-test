import { Download } from "lucide-react";
import type { Metadata } from "next";

import { FiltersBar } from "@/components/filters-bar";
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
import { normStatus, warehouseReport } from "@/features/warehouse/sheets";
import { businessToday, formatDate, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Отчёт по складу" };

const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="max-h-[60vh] overflow-auto rounded-lg border">{children}</div>
    </section>
  );
}

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

  return (
    <>
      <PageHeader
        title="Отчёт по складу"
        description={`${project.label} · с ${formatDate(from)} по ${formatDate(to)}`}
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
      <FiltersBar
        fields={[
          { name: "from", label: "Начало периода", type: "date" },
          { name: "to", label: "Конец периода", type: "date" },
        ]}
      />

      <Section title="Приход за период">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Материал</TableHead>
              <TableHead>Ед. изм.</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead>Поставщик</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.incoming.length === 0
              ? empty(4)
              : report.incoming.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.material}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(r.quantity)}</TableCell>
                    <TableCell className="whitespace-normal">{r.suppliers}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Расход за период по блокам и этапам">
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
      </Section>

      <Section title={`Остаток на складе на ${formatDate(to)}`}>
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
      </Section>
    </>
  );
}
