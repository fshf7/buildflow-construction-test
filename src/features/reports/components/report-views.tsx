import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

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
  loadReport,
  REPORTS,
  type Cell,
  type Column,
  type ReportDef,
} from "@/features/reports/definitions";
import { reportLookups } from "@/features/reports/lookups";
import type { OrgAccess } from "@/lib/auth/access-model";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

function show(v: Cell, c: Column, currency: Cell): string {
  if (v === null || v === "") return "—";
  if (c.kind === "money")
    return formatMoney(Number(v), typeof currency === "string" ? currency : "TJS");
  if (c.kind === "qty") return formatQuantity(Number(v));
  if (c.kind === "date") return formatDate(String(v));
  return String(v);
}

/** Где открыт отчёт (Д-94): внутри объекта — только его данные; иначе — по всем объектам. */
export type ReportScope = { projectId: string | null; base: string };

/** Отчёты, доступные по правам (Д-75); внутри объекта — только с разрезом по объекту. */
export function visibleReports(org: OrgAccess, scope: ReportScope): ReportDef[] {
  return REPORTS.filter((r) => canSeeReport(org, r) && (scope.projectId === null || r.byProject));
}

export function ReportsIndex({ org, scope }: { org: OrgAccess; scope: ReportScope }) {
  const reports = visibleReports(org, scope);
  if (reports.length === 0) redirect("/no-access?reason=forbidden");
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {reports.map((r) => (
        <li key={r.key}>
          <Link
            href={`${scope.base}/${r.key}`}
            className="flex h-full items-center gap-3 rounded-xl border p-4 hover:bg-muted/50"
          >
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-semibold">{r.title}</span>
              <span className="text-sm text-muted-foreground">{r.description}</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function ReportView({
  org,
  def,
  searchParams,
  scope,
}: {
  org: OrgAccess;
  def: ReportDef;
  searchParams: Record<string, string | string[] | undefined>;
  scope: ReportScope;
}) {
  if (!visibleReports(org, scope).includes(def)) redirect("/no-access?reason=forbidden");
  const p = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, typeof v === "string" ? v : undefined]),
  );
  // Внутри объекта объект задан адресом — параметр из URL не учитывается.
  if (scope.projectId !== null) p.project = scope.projectId;
  const [data, lookups] = await Promise.all([loadReport(def, org.id, p), reportLookups(org)]);
  const filters = def
    .filters(lookups)
    .filter((f) => scope.projectId === null || f.name !== "project");
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
      <FiltersBar fields={filters} />
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
