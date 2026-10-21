import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listWorkStages } from "@/features/catalog/queries";
import { requireObject } from "@/features/projects/object";
import { listBlockOptions, listMaterialOptions } from "@/features/shared/lookups";
import { NormsSheet } from "@/features/warehouse/components/norms-sheet";
import { listNormUsage } from "@/features/warehouse/sheets";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Нормативы" };

/** Нормативы расхода (Д-100): материал + блок + этап; задаёт управляющий. */
export default async function NormsPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/norms">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["stock.view", "norms.manage"]))
    redirect("/no-access?reason=forbidden");
  const [usage, materials, blocks, stages] = await Promise.all([
    listNormUsage(project.id),
    listMaterialOptions(org.id),
    listBlockOptions(project.id),
    listWorkStages(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Нормативы"
        description="Сколько материала положено на блок и этап работ, сколько выдано и сколько осталось."
      />
      <NormsSheet
        usage={usage}
        materials={materials}
        blocks={blocks}
        stages={stages.map((s) => ({ id: s.id, label: s.name }))}
        canEdit={hasPermission(org, "norms.manage")}
      />
    </>
  );
}
