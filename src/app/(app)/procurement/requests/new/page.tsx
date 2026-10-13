import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { RequestEditor } from "@/features/procurement/components/request-editor";
import {
  listMaterialOptions,
  listProjectOptions,
  listSupplierOptions,
} from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Новая заявка" };

export default async function NewRequestPage() {
  const org = await requirePermission("purchase_requests.manage");
  const [projects, materials, suppliers] = await Promise.all([
    listProjectOptions(org.id),
    listMaterialOptions(org.id),
    listSupplierOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Новая заявка"
        description="Поставщик и цена нужны каждой строке, чтобы выдать заявку в работу."
      />
      <RequestEditor projects={projects} materials={materials} suppliers={suppliers} />
    </>
  );
}
