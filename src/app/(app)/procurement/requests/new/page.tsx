import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { RequestEditor } from "@/features/procurement/components/request-editor";
import { listMaterialOptions, listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { draftStorageKey } from "@/lib/form-draft-store";

export const metadata: Metadata = { title: "Новая заявка" };

export default async function NewRequestPage() {
  const org = await requirePermission("purchase_requests.manage");
  const [projects, materials] = await Promise.all([
    listProjectOptions(org.id),
    listMaterialOptions(org.id),
  ]);
  return (
    <>
      <PageHeader
        title="Новая заявка"
        description="Что и сколько нужно объекту. Поставщика и цену указывать не нужно: поставщика выберете при приёмке, цены внесёт бухгалтер из накладной."
      />
      <RequestEditor
        projects={projects}
        materials={materials}
        draftKey={draftStorageKey(org.member_id, "request.new")}
      />
    </>
  );
}
