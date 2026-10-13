import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canSeeReport,
  findReport,
  loadReport,
  type Cell,
  type Column,
} from "@/features/reports/definitions";
import { reportLookups } from "@/features/reports/lookups";
import { requireOrg } from "@/lib/auth/access";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Отчёт" };

function show(v: Cell, c: Column, currency: Cell): string {
  if (v === null || v === "") return "—";
  if (c.kind === "money")
    return formatMoney(Number(v), typeof currency === "string" ? currency : "TJS");
  if (c.kind === "qty") return formatQuantity(Number(v));
  if (c.kind === "date") return formatDate(String(v));
  return String(v);
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const org = await requireOrg();
  const { report } = await params;
  const def = findReport(report);
  if (!def) notFound();
  if (!canSeeReport(org, def)) redirect("/no-access?reason=forbidden");
  const sp = await searchParams;
  const p = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, typeof v === "string" ? v : undefined]),
  );
  const [data, lookups] = await Promise.all([loadReport(def, org.id, p), reportLookups(org)]);
  const query = new URLSearchParams(
    Object.entries(p).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const numeric = (c: Column) => c.kind === "money" || c.kind === "qty";

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title={def.title}
        description={def.description}
        actions={
          <div className="flex gap-2">
            <a
              href={`/reports/${def.key}/export?format=csv${query ? `&${query}` : ""}`}
              className={buttonVariants({ variant: "outline" })}
              download
            >
              CSV
            </a>
            <a
              href={`/reports/${def.key}/export?format=xlsx${query ? `&${query}` : ""}`}
              className={buttonVariants({ variant: "outline" })}
              download
            >
              Excel
            </a>
          </div>
        }
      />
      <FiltersBar fields={def.filters(lookups)} />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {data.columns.map((c) => (
                <TableHead key={c.key} className={cn(numeric(c) && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={data.columns.length}
                  className="h-20 text-center text-muted-foreground"
                >
                  Нет данных
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r, i) => (
                <TableRow key={i}>
                  {data.columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(numeric(c) && "text-right whitespace-nowrap tabular-nums")}
                    >
                      {show(r[c.key] ?? null, c, r.currency ?? null)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {data.totals && data.rows.length > 0 ? (
            <TableFooter>
              <TableRow data-testid="report-totals">
                {data.columns.map((c, i) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "font-semibold",
                      numeric(c) && "text-right whitespace-nowrap tabular-nums",
                    )}
                  >
                    {i === 0
                      ? "Итого"
                      : c.key in data.totals!
                        ? formatMoney(data.totals![c.key]!, data.currency ?? undefined)
                        : ""}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
