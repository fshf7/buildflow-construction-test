import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/features/audit/components/audit-table";
import { listAudit } from "@/features/audit/queries";
import { requirePermission } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Журнал аудита" };

export default async function AuditPage() {
  const org = await requirePermission("audit.view");
  const rows = await listAudit(org.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Журнал аудита"
        description="Последние 100 изменений в организации. Журнал нельзя изменить или удалить."
      />
      <AuditTable rows={rows} />
    </div>
  );
}
