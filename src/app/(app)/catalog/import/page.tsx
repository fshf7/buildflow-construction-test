import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { IMPORT_KINDS, isImportKind, type ImportKind } from "@/features/catalog/import/columns";
import { ImportWizard } from "@/features/catalog/import/import-wizard";
import { requireOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Импорт справочников" };

export default async function CatalogImportPage({ searchParams }: PageProps<"/catalog/import">) {
  const org = await requireOrg();
  const allowed = (Object.keys(IMPORT_KINDS) as ImportKind[]).filter((k) =>
    hasPermission(org, k === "crews" ? "crews.manage" : "catalog.manage"),
  );
  if (allowed.length === 0) redirect("/no-access?reason=forbidden");
  const { kind: raw } = await searchParams;
  const kind = isImportKind(raw) && allowed.includes(raw) ? raw : allowed[0]!;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Импорт из Excel"
        description="Перенос справочников из таблиц: материалы, поставщики, бригады. Цены не импортируются."
      />
      <nav aria-label="Справочник" className="flex gap-1 overflow-x-auto border-b">
        {allowed.map((k) => (
          <Link
            key={k}
            href={`/catalog/import?kind=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              k === kind
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {IMPORT_KINDS[k].title}
          </Link>
        ))}
      </nav>
      <ImportWizard key={kind} kind={kind} />
    </div>
  );
}
