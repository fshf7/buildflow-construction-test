import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { OpeningActions } from "@/features/opening/components/opening-actions";
import { OpeningEditor } from "@/features/opening/components/opening-editor";
import { openingEditorData } from "@/features/opening/editor-data";
import { getOpening } from "@/features/opening/queries";
import { OPENING_KIND_LABELS } from "@/features/opening/schemas";
import { requirePermission } from "@/lib/auth/access";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Ввод остатков" };

const STATUS = { DRAFT: "Черновик", POSTED: "Проведён", REVERSED: "Сторнирован" } as const;
const num = (v: number) => String(v).replace(".", ",");

export default async function OpeningDocPage({ params }: PageProps<"/opening/[id]">) {
  const org = await requirePermission("opening_balances.manage");
  const { id } = await params;
  const o = await getOpening(id);
  if (!o) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={o.number ? `Ввод остатков ${o.number}` : "Ввод остатков (черновик)"}
        description={`${OPENING_KIND_LABELS[o.kind]} на ${formatDate(o.docDate)}${o.projectLabel ? ` · ${o.projectLabel}` : ""}`}
      />
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline">{STATUS[o.status]}</Badge>
        {o.cancelReason ? (
          <span className="text-muted-foreground">Причина сторно: {o.cancelReason}</span>
        ) : null}
      </div>
      <OpeningActions id={o.id} status={o.status} />
      {o.status === "DRAFT" ? (
        <OpeningEditor
          kind={o.kind}
          {...await openingEditorData(org.id)}
          initial={{
            id: o.id,
            docDate: o.docDate,
            projectId: o.projectId ?? "",
            note: o.note,
            lines:
              o.kind === "STOCK"
                ? o.stock.map((l) => ({ materialId: l.materialId, quantity: num(l.quantity) }))
                : o.kind === "CASH"
                  ? o.cash.map((l) => ({ accountId: l.accountId, amount: num(l.amount) }))
                  : o.payables.map((l) => ({
                      supplierId: l.supplierId,
                      projectId: l.projectId ?? "",
                      amount: num(l.amount),
                      currency: l.currency,
                      basis: l.basis,
                      dueDate: l.dueDate ?? "",
                    })),
          }}
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {o.stock.map((l) => (
            <li key={l.materialId} className="flex justify-between p-3">
              <span>{l.name}</span>
              <b>{formatQuantity(l.quantity, l.unit)}</b>
            </li>
          ))}
          {o.cash.map((l) => (
            <li key={l.accountId} className="flex justify-between p-3">
              <span>{l.name}</span>
              <b>{formatMoney(l.amount, l.currency)}</b>
            </li>
          ))}
          {o.payables.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 p-3">
              <span>
                {l.supplierName}
                <span className="block text-xs text-muted-foreground">
                  {l.basis}
                  {l.dueDate ? ` · срок ${formatDate(l.dueDate)}` : ""}
                </span>
              </span>
              <b>{formatMoney(l.amount, l.currency)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
