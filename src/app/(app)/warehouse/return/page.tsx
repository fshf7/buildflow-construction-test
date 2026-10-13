import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { resolveProject } from "@/features/warehouse/context";
import { listRecentIssues } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatDate, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Возврат" };

// US-04: возврат всегда связан с выдачей — сначала выбрать выдачу.
export default async function ReturnPage({ searchParams }: PageProps<"/warehouse/return">) {
  const org = await requirePermission("material_issues.post");
  const { project: requested } = await searchParams;
  const { project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет назначенных объектов.</p>;
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
        <ul className="flex flex-col gap-2">
          {issues.map((i) => (
            <li key={i.id}>
              <Link
                href={`/warehouse/return/${i.id}`}
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
        </ul>
      )}
    </>
  );
}
