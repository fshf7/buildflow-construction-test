import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listBlockOptions, listCrewOptions } from "@/features/shared/lookups";
import { IssueForm } from "@/features/warehouse/components/issue-form";
import { resolveProject } from "@/features/warehouse/context";
import { listBalances } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Выдача" };

export default async function IssuePage({ searchParams }: PageProps<"/warehouse/issue">) {
  const org = await requirePermission("material_issues.post");
  const { project: requested } = await searchParams;
  const { project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет назначенных объектов.</p>;
  const [crews, blocks, balances] = await Promise.all([
    listCrewOptions(org.id),
    listBlockOptions(project.id),
    listBalances(project.id),
  ]);

  return (
    <>
      <PageHeader title="Выдача бригаде" description={project.label} />
      <IssueForm projectId={project.id} crews={crews} blocks={blocks} balances={balances} />
    </>
  );
}
