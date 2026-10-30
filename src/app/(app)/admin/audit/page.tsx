import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ServerPager } from "@/components/pagination";
import { AuditTable } from "@/features/audit/components/audit-table";
import { listAudit } from "@/features/audit/queries";
import { requirePermission } from "@/lib/auth/access";
import { resolvePage } from "@/lib/pagination";

export const metadata: Metadata = { title: "Журнал аудита" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const org = await requirePermission("audit.view");
  const { page } = await searchParams;
  // Число страниц знает только БД: «слишком большой» номер она сведёт к последней странице.
  const { rows, total } = await listAudit(
    org.id,
    resolvePage(typeof page === "string" ? page : null, Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Журнал аудита"
        description="Все изменения в организации, новые сверху. Журнал нельзя изменить или удалить."
      />
      <AuditTable rows={rows} />
      <ServerPager total={total} />
    </div>
  );
}
