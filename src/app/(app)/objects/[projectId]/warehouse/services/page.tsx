import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listServices, listWorkStages } from "@/features/catalog/queries";
import { requireObject } from "@/features/projects/object";
import {
  listBlockOptions,
  listResponsibleOptions,
  listUnitOptions,
} from "@/features/shared/lookups";
import { ServicesSheet } from "@/features/warehouse/components/services-sheet";
import { listServiceRows } from "@/features/warehouse/sheets";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Услуги" };

/** «Услуги» склада таблицей (Д-100): кран, экскаватор, питание — по блокам, этапам и бригадам. */
export default async function ServicesPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/services">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]))
    redirect("/no-access?reason=forbidden");
  const [rows, services, units, blocks, stages, crews] = await Promise.all([
    listServiceRows(project.id),
    listServices(org.id, true),
    listUnitOptions(org.id),
    listBlockOptions(project.id),
    listWorkStages(org.id),
    listResponsibleOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Услуги"
        description="Кран, экскаватор, геодезист, питание — сколько, где и для какой бригады."
      />
      <ServicesSheet
        rows={rows}
        services={services}
        units={units}
        blocks={blocks}
        stages={stages.map((s) => ({ id: s.id, label: s.name }))}
        crews={crews}
        canEdit={hasPermission(org, "material_issues.post")}
        canFixOld={hasPermission(org, "goods_receipts.approve_correction")}
        today={businessToday()}
      />
    </>
  );
}
