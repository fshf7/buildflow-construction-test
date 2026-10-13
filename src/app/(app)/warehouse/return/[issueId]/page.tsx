import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ReturnForm } from "@/features/warehouse/components/return-form";
import { returnFormData } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Возврат" };

export default async function ReturnFormPage({ params }: PageProps<"/warehouse/return/[issueId]">) {
  await requirePermission("material_issues.post");
  const { issueId } = await params;
  const data = await returnFormData(issueId);
  if (!data || data.status !== "POSTED") notFound();

  return (
    <>
      <PageHeader title={`Возврат: ${data.crewName}`} description={`По выдаче ${data.number}`} />
      <ReturnForm issueId={data.id} lines={data.lines} />
    </>
  );
}
