import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listWorkStages } from "@/features/catalog/queries";
import { requireObject } from "@/features/projects/object";
import {
  listBlockOptions,
  listMaterialOptions,
  listResponsibleOptions,
} from "@/features/shared/lookups";
import { OutgoingSheet } from "@/features/warehouse/components/outgoing-sheet";
import { listBalances } from "@/features/warehouse/queries";
import { listNormUsage, listOutgoingRows } from "@/features/warehouse/sheets";
import { hasAnyPermission, hasPermission } from "@/lib/auth/access-model";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Расход" };

/** «Расход» склада таблицей (Д-100); прораб видит выдачи своих бригад (Д-26, только чтение). */
export default async function OutgoingPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/outgoing">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId);
  if (!hasAnyPermission(org, ["stock.view", "stock.view_own_crews"]))
    redirect("/no-access?reason=forbidden");
  const stockView = hasPermission(org, "stock.view");
  const [rows, materials, balances, blocks, stages, crews, norms] = await Promise.all([
    listOutgoingRows(project.id),
    listMaterialOptions(org.id),
    stockView ? listBalances(project.id) : Promise.resolve([]),
    listBlockOptions(project.id),
    listWorkStages(org.id),
    listResponsibleOptions(org.id),
    stockView ? listNormUsage(project.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Расход"
        description="Выдачи со склада: на какой блок, этаж и этап работ, кому (бригадир). Норматив и его остаток — рядом."
      />
      <OutgoingSheet
        rows={rows}
        materials={materials}
        balances={balances}
        blocks={blocks}
        stages={stages.map((s) => ({ id: s.id, label: s.name }))}
        crews={crews}
        norms={norms}
        canEdit={hasPermission(org, "material_issues.post")}
        canFixOld={hasPermission(org, "goods_receipts.approve_correction")}
        today={businessToday()}
      />
    </>
  );
}
