import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { ReportsIndex } from "@/features/reports/components/report-views";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Отчёты" };

// Д-94: отчёты по этому объекту (с разрезом по объекту); сводные — в «Общем».
export default async function ObjectReportsPage({
  params,
}: PageProps<"/objects/[projectId]/reports">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="Отчёты"
        description={`По объекту ${project.label}. Экспорт в CSV и Excel — с теми же суммами, что на экране.`}
      />
      <ReportsIndex
        org={org}
        scope={{ projectId: project.id, base: objectHref(project.id, "/reports") }}
      />
    </div>
  );
}
