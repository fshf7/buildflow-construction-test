import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RequestsTable } from "@/features/procurement/components/requests-table";
import { REQUEST_STATUS_LABELS } from "@/features/procurement/labels";
import { listRequests } from "@/features/procurement/queries";
import { listFiltersSchema } from "@/features/procurement/schemas";
import { listProjectOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Заявки" };

export default async function RequestsPage({ searchParams }: PageProps<"/procurement/requests">) {
  const org = await requirePermission("purchase_requests.view");
  const filters = listFiltersSchema.parse(await searchParams);
  const [rows, projects] = await Promise.all([
    listRequests(org.id, filters),
    listProjectOptions(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Заявки на закупку"
        description="Заявки склада для снабженца: что и сколько нужно. Поставщики и цены — из приёмок и накладных."
        actions={
          hasPermission(org, "purchase_requests.manage") ? (
            <Link href="/procurement/requests/new" className={buttonVariants()}>
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
          {
            name: "project",
            label: "Объект",
            type: "select",
            options: projects.map((p) => ({ value: p.id, label: p.label })),
          },
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <RequestsTable rows={rows} />
    </>
  );
}
