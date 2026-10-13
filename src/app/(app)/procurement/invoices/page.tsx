import type { Metadata } from "next";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { InvoicesTable } from "@/features/procurement/components/invoices-table";
import { INVOICE_STATUS_LABELS } from "@/features/procurement/labels";
import { listInvoices } from "@/features/procurement/queries";
import { listFiltersSchema } from "@/features/procurement/schemas";
import { listProjectOptions, listSupplierOptions } from "@/features/shared/lookups";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

export const metadata: Metadata = { title: "Накладные" };

export default async function InvoicesPage({ searchParams }: PageProps<"/procurement/invoices">) {
  const org = await requirePermission("supplier_invoices.view");
  const filters = listFiltersSchema.parse(await searchParams);
  const withPrices = hasPermission(org, "prices.view");
  const [rows, projects, suppliers] = await Promise.all([
    listInvoices(org.id, filters, withPrices),
    listProjectOptions(org.id),
    listSupplierOptions(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Накладные поставщиков"
        description="Подтверждённая накладная создаёт обязательство перед поставщиком (Д-13)."
        actions={
          hasPermission(org, "supplier_invoices.manage") ? (
            <Link href="/procurement/invoices/new" className={buttonVariants()}>
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
            name: "project",
            label: "Объект",
            type: "select",
            options: projects.map((p) => ({ value: p.id, label: p.label })),
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
