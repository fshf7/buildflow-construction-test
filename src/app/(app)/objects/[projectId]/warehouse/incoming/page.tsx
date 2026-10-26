import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireObject } from "@/features/projects/object";
import { listMaterialOptions, listUnitOptions } from "@/features/shared/lookups";
import { IncomingSheet } from "@/features/warehouse/components/incoming-sheet";
import { listIncomingRows } from "@/features/warehouse/sheets";
import { hasPermission } from "@/lib/auth/access-model";
import { businessToday } from "@/lib/format";

export const metadata: Metadata = { title: "Приход" };

/** «Приход» склада таблицей (Д-100). */
export default async function IncomingPage({
  params,
}: PageProps<"/objects/[projectId]/warehouse/incoming">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "stock.view");
  const [rows, materials, units] = await Promise.all([
    listIncomingRows(project.id),
    listMaterialOptions(org.id),
    listUnitOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Приход"
        description="Что пришло на склад: дата, наименование, количество. Поставщика вносит бухгалтер в накладной."
      />
      <IncomingSheet
        rows={rows}
        materials={materials}
        units={units}
        canEdit={hasPermission(org, "goods_receipts.post")}
        canFixOld={hasPermission(org, "goods_receipts.approve_correction")}
        today={businessToday()}
      />
    </>
  );
}
