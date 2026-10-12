import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import {
  MaterialsSection,
  SuppliersSection,
  UnitsSection,
} from "@/features/catalog/components/catalog-tables";
import { listMaterials, listSuppliers, listUnits } from "@/features/catalog/queries";
import { requirePermission } from "@/lib/auth/access";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Справочники" };

const TABS = [
  { key: "materials", label: "Материалы" },
  { key: "suppliers", label: "Поставщики" },
  { key: "units", label: "Единицы измерения" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const org = await requirePermission("catalog.manage");
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "materials";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Справочники"
        description="Записи не удаляются — на них ссылаются документы. Ненужное убирайте в архив."
      />
      {/* Вкладки — ссылки: состояние в URL, работает «назад» и обновление страницы */}
      <nav aria-label="Справочники" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/catalog?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              t.key === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "materials" ? (
        <MaterialsSection materials={await listMaterials(org.id)} units={await listUnits(org.id)} />
      ) : tab === "suppliers" ? (
        <SuppliersSection suppliers={await listSuppliers(org.id)} />
      ) : (
        <UnitsSection units={await listUnits(org.id)} />
      )}
    </div>
  );
}
