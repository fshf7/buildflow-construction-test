import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ReportsIndex } from "@/features/reports/components/report-views";
import { requireOrg } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Отчёты по всем объектам" };

// Д-75: список — по правам отдельных отчётов. Д-94: здесь — сводно по всем объектам.
export default async function ReportsPage() {
  const org = await requireOrg();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="Отчёты по всем объектам"
        description="Сводно по всем доступным вам объектам. Экспорт в CSV и Excel — с теми же суммами, что на экране."
      />
      <ReportsIndex org={org} scope={{ projectId: null, base: "/reports" }} />
    </div>
  );
}
