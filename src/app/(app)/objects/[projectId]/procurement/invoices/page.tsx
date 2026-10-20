import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { InvoicesTable } from "@/features/procurement/components/invoices-table";
import { INVOICE_STATUS_LABELS } from "@/features/procurement/labels";
import { listInvoices } from "@/features/procurement/queries";
import { listFiltersSchema } from "@/features/procurement/schemas";
import { requireObject } from "@/features/projects/object";
import { listSupplierOptions } from "@/features/shared/lookups";
import { hasPermission } from "@/lib/auth/access-model";
import { objectHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Накладные" };

export default async function InvoicesPage({
  params,
  searchParams,
}: PageProps<"/objects/[projectId]/procurement/invoices">) {
  const { projectId } = await params;
  const { org, project } = await requireObject(projectId, "supplier_invoices.view");
  const filters = listFiltersSchema.parse(await searchParams);
  const withPrices = hasPermission(org, "prices.view");
  // Д-94: только накладные этого объекта.
  const [rows, suppliers] = await Promise.all([
    listInvoices(org.id, { ...filters, project: project.id }, withPrices),
    listSupplierOptions(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Накладные поставщиков"
        description="Подтверждённая накладная создаёт обязательство перед поставщиком (Д-13)."
        actions={
          hasPermission(org, "supplier_invoices.manage") ? (
            <Link
              href={objectHref(project.id, "/procurement/invoices/new")}
              className={buttonVariants()}
            >
              Ввести накладную
            </Link>
          ) : null
        }
      />
      <FiltersBar
        fields={[
          { name: "q", label: "Номер", type: "search", placeholder: "НК-… или № поставщика" },
          {
            name: "status",
            label: "Статус",
            type: "select",
            options: Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            name: "supplier",
            label: "Поставщик",
            type: "select",
            options: suppliers.map((s) => ({ value: s.id, label: s.label })),
          },
          { name: "from", label: "С даты", type: "date" },
          { name: "to", label: "По дату", type: "date" },
        ]}
      />
      <InvoicesTable rows={rows} withPrices={withPrices} />
    </>
  );
}
