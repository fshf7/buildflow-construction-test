import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listMaterialOptions, listSupplierOptions } from "@/features/shared/lookups";
import { ReceiveForm } from "@/features/warehouse/components/receive-form";
import { resolveProject } from "@/features/warehouse/context";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Приёмка без заявки" };

export default async function FreeReceivePage({
  searchParams,
}: PageProps<"/warehouse/receive/free">) {
  const org = await requirePermission("goods_receipts.post");
  const { project: requested } = await searchParams;
  const { project } = await resolveProject(org.id, requested);
  if (!project) return <p className="text-muted-foreground">Нет назначенных объектов.</p>;
  const [suppliers, materials] = await Promise.all([
    listSupplierOptions(org.id),
    listMaterialOptions(org.id),
  ]);

  return (
    <>
      <PageHeader title="Приёмка без заявки" description={project.label} />
      <ReceiveForm projectId={project.id} suppliers={suppliers} materials={materials} />
    </>
  );
}
