import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { MOVEMENT_LABELS } from "@/features/warehouse/labels";
import { resolveProject } from "@/features/warehouse/context";
import { listBalances, listMaterialMovements } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Движение материала" };

// Остаток = Σ движений (источник истины — stock_movements, §6.4).
export default async function MaterialStockPage({
  params,
  searchParams,
}: PageProps<"/warehouse/stock/[materialId]">) {
  const org = await requirePermission("stock.view");
  const { materialId } = await params;
  const { project: requested } = await searchParams;
  const { project } = await resolveProject(org.id, requested);
  if (!project) notFound();
  const [balances, movements] = await Promise.all([
    listBalances(project.id),
    listMaterialMovements(project.id, materialId),
  ]);
  const balance = balances.find((b) => b.materialId === materialId);
  if (!balance) notFound();

  return (
    <>
      <PageHeader
        title={balance.name}
        description={`${project.label} · остаток ${formatQuantity(balance.quantity, balance.unit)}`}
      />
      <ul className="flex flex-col divide-y rounded-lg border">
        {movements.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span className="flex flex-col">
              <span>{MOVEMENT_LABELS[m.movement_type]}</span>
              <span className="text-xs text-muted-foreground">{formatDate(m.occurred_on)}</span>
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                Number(m.quantity) > 0 ? "text-emerald-700" : "text-foreground",
              )}
            >
              {Number(m.quantity) > 0 ? "+" : ""}
              {formatQuantity(m.quantity, balance.unit)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
