import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PagedPager, PageSlice } from "@/components/pagination";
import { requireObject } from "@/features/projects/object";
import { listRecentIssues } from "@/features/warehouse/queries";
import { formatDate, formatQuantity } from "@/lib/format";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Возврат" };

// US-04: возврат всегда связан с выдачей — сначала выбрать выдачу.
export default async function ReturnPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/return">) {
  const { projectId } = await params;
  const { project } = await requireObject(projectId, "material_issues.post");
  const issues = await listRecentIssues(project.id);

  return (
    <>
      <PageHeader
        title="Возврат: по какой выдаче?"
        description={`${project.label} · выдачи за 30 дней`}
      />
      {issues.length === 0 ? (
        <p className="text-muted-foreground">Проведённых выдач за 30 дней нет.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            <PageSlice>
              {issues.map((i) => (
                <li key={i.id}>
                  <Link
                    href={objectHref(project.id, `/warehouse/return/${i.id}`)}
                    className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50 active:bg-muted"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-base font-semibold">{i.crewName}</span>
                      <span className="text-xs text-muted-foreground">
                        {i.number} · {formatDate(i.docDate)} · {i.place}
                      </span>
                      <span className="text-sm">
                        {i.lines
                          .map((l) => `${l.name} ${formatQuantity(l.quantity, l.unit)}`)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </PageSlice>
          </ul>
          <PagedPager total={issues.length} />
        </>
      )}
    </>
  );
}
