import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RequestsTable } from "@/features/procurement/components/requests-table";
import { REQUEST_STATUS_LABELS } from "@/features/procurement/labels";
import { listRequests } from "@/features/procurement/queries";
import { listFiltersSchema } from "@/features/procurement/schemas";
import { requireObject } from "@/features/projects/object";
import { hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Заявки" };

export default async function RequestsPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/warehouse/requests">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "purchase_requests.view");
  const filters = listFiltersSchema.parse(await searchParams);
  // Д-94: только заявки этого объекта.
  const rows = await listRequests(org.id, { ...filters, project: project.id });

  return (
    <>
      <PageHeader
        title="Заявки на закупку"
        description="Заявки склада для снабженца: что и сколько нужно. Поставщики и цены — из приёмок и накладных."
        actions={
          hasPermission(org, "purchase_requests.manage") ? (
            <Link
              href={objectHref(project.id, "/warehouse/requests/new")}
              className={buttonVariants()}
            >
              Новая заявка
            </Link>
          ) : null
        }
      />
      <FiltersBar
        fields={[
          { name: "q", label: "Номер", type: "search", placeholder: "ЗК-2026-…" },
          {
            name: "status",
            label: "Статус",
            type: "select",
            options: Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <RequestsTable rows={rows} />
    </>
  );
}
