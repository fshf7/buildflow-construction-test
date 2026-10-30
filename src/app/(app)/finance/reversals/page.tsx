import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { PagedPager, PageSlice } from "@/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORY_LABELS } from "@/features/finance/labels";
import { reversalsReport } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Сторно за период" };

const date = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

// Д-67: кто инициировал, кто согласовал, сумма, причина. Бухгалтер и org_admin.
export default async function ReversalsPage({ searchParams }: PageProps<"/finance/reversals">) {
  const org = await requirePermission("cash.reversals_report");
  const { from, to } = await searchParams;
  const rows = await reversalsReport(org.id, date(from), date(to));
  const canOpen = hasPermission(org, "cash.view");

  return (
    <>
      <PageHeader
        title="Сторно за период"
        description="Сторнированные кассовые операции: инициатор, согласовавший, сумма и причина."
      />
      <FiltersBar
        fields={[
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Операция</TableHead>
              <TableHead>Вид</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Инициировал</TableHead>
              <TableHead>Согласовал</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  Сторно за период нет
                </TableCell>
              </TableRow>
            ) : (
              <PageSlice>
                {rows.map((r) => (
                  <TableRow key={r.transactionId}>
                    <TableCell className="whitespace-nowrap">
                      {canOpen ? (
                        <Link
                          href={`/finance/operations/${r.transactionId}`}
                          className="font-medium hover:underline"
                        >
                          {r.number}
                        </Link>
                      ) : (
                        r.number
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {r.accountName} · сторно {r.reversalNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      {CATEGORY_LABELS[r.category]}
                      {r.counterparty ? ` · ${r.counterparty}` : ""}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.direction === "IN" ? "+" : "−"}
                      {formatMoney(r.amount, r.currency)}
                    </TableCell>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.initiatedBy}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(r.initiatedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.approvedBy}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(r.approvedAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </PageSlice>
            )}
          </TableBody>
        </Table>
      </div>
      <PagedPager total={rows.length} />
    </>
  );
}
