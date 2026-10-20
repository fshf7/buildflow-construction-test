import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireObject } from "@/features/projects/object";
import { ReportView } from "@/features/reports/components/report-views";
import { findReport } from "@/features/reports/definitions";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Отчёт" };

export default async function ObjectReportPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/reports/[report]">) {
  const { projectId, report } = await params;
  const { org, project } = await requireObject(projectId);
  const def = findReport(report);
  if (!def) notFound();
  return (
    <ReportView
      org={org}
      def={def}
      searchParams={await searchParams}
      scope={{ projectId: project.id, base: objectHref(project.id, "/reports") }}
    />
  );
}
