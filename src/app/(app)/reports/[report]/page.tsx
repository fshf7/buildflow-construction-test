import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportView } from "@/features/reports/components/report-views";
import { findReport } from "@/features/reports/definitions";
import { requireOrg } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Отчёт" };

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const org = await requireOrg();
  const { report } = await params;
  const def = findReport(report);
  if (!def) notFound();
  return (
    <ReportView
      org={org}
      def={def}
      searchParams={await searchParams}
      scope={{ projectId: null, base: "/reports" }}
    />
  );
}
