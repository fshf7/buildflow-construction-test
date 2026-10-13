import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { REPORTS, canSeeReport } from "@/features/reports/definitions";
import { requireOrg } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Отчёты" };

// Д-75: список — по правам отдельных отчётов; склад видит только складские (без цен).
export default async function ReportsPage() {
  const org = await requireOrg();
  const reports = REPORTS.filter((r) => canSeeReport(org, r));
  if (reports.length === 0) redirect("/no-access?reason=forbidden");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="Отчёты"
        description="Экспорт в CSV и Excel — с теми же суммами, что на экране."
      />
      <ul className="grid gap-2 sm:grid-cols-2">
        {reports.map((r) => (
          <li key={r.key}>
            <Link
              href={`/reports/${r.key}`}
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
    </div>
  );
}
