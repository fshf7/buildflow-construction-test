import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { listPendingCorrections } from "@/features/procurement/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Согласования" };

// Д-06: корректировки приёмок после начала сверки — только с согласия бухгалтера.
export default async function ApprovalsPage() {
  const org = await requirePermission("goods_receipts.approve_correction");
  const rows = await listPendingCorrections(org.id);

  return (
    <>
      <PageHeader
        title="Корректировки приёмок на согласовании"
        description="Склад исправил количества после начала сверки заявки. Откройте, сравните и согласуйте или верните."
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Нет корректировок, ожидающих решения.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/warehouse/receipts/${r.id}`}
                className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-muted/50"
              >
                <span className="font-medium">
                  {r.projectCode} · {r.supplierName}
                  {r.requestNumber ? ` · заявка ${r.requestNumber}` : ""}
                </span>
                <span className="text-sm">Причина: {r.reason}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
