import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CorrectionForm } from "@/features/warehouse/components/correction-form";
import { ReceiptCorrectionStart } from "@/features/warehouse/components/receipt-correction-start";
import { CorrectionDecision } from "@/features/warehouse/components/warehouse-actions";
import { RECEIPT_STATUS_LABELS } from "@/features/warehouse/labels";
import { getReceipt } from "@/features/warehouse/queries";
import { requirePermission } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Приёмка" };

const ACTION_LABELS: Record<string, string> = {
  SUBMIT: "Отправлено на согласование",
  APPROVE: "Согласовано",
  RETURN: "Возвращено складу",
  REJECT: "Отклонено",
};

export default async function ReceiptPage({ params }: PageProps<"/warehouse/receipts/[id]">) {
  const org = await requirePermission("stock.view");
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();
  const canPost = hasPermission(org, "goods_receipts.post");
  const isCorrection = Boolean(receipt.correctsReceiptId);
  const title = receipt.number
    ? `Приёмка ${receipt.number}`
    : isCorrection
      ? "Корректировка приёмки (черновик)"
      : "Приёмка (черновик)";

  return (
    <>
      <PageHeader
        title={title}
        description={`${receipt.supplierName} · ${receipt.projectLabel} · ${formatDate(receipt.docDate)}`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={receipt.status === "POSTED" ? "default" : "secondary"}>
          {RECEIPT_STATUS_LABELS[receipt.status]}
        </Badge>
        {receipt.requestNumber && receipt.requestId ? (
          <span>
            Заявка{" "}
            {hasPermission(org, "purchase_requests.view") ? (
              <Link
                href={`/procurement/requests/${receipt.requestId}`}
                className="underline underline-offset-4"
              >
                {receipt.requestNumber}
              </Link>
            ) : (
              receipt.requestNumber
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">Без заявки</span>
        )}
        {receipt.correctedBy ? (
          <Link
            href={`/warehouse/receipts/${receipt.correctedBy}`}
            className="underline underline-offset-4"
          >
            Исправленная приёмка →
          </Link>
        ) : null}
        {receipt.correctsReceiptId ? (
          <Link
            href={`/warehouse/receipts/${receipt.correctsReceiptId}`}
            className="underline underline-offset-4"
          >
            ← Исходная приёмка
          </Link>
        ) : null}
      </div>
      {receipt.correctionReason ? (
        <p className="text-sm">Причина корректировки: {receipt.correctionReason}</p>
      ) : null}

      {/* Черновик корректировки — форма; иначе — строки документа. */}
      {receipt.status === "DRAFT" && isCorrection && canPost ? (
        <CorrectionForm receipt={{ ...receipt, lines: receipt.lines }} />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {receipt.lines.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              Строк нет — приёмка сторнирована целиком.
            </li>
          ) : null}
          {receipt.lines.map((l) => {
            const before = receipt.originalLines.find((o) => o.materialId === l.materialId);
            return (
              <li key={l.id} className="flex flex-col gap-1 p-3">
                <span className="font-medium">{l.name}</span>
                <span className="text-sm">
                  Принято <b>{formatQuantity(l.received, l.unit)}</b>
                  {l.ordered !== null ? ` · заказано ${formatQuantity(l.ordered, l.unit)}` : ""}
                  {before && before.received !== l.received
                    ? ` · было ${formatQuantity(before.received, before.unit)}`
                    : ""}
                </span>
              </li>
            );
          })}
          {/* В корректировке убранные строки — тоже видны бухгалтеру. */}
          {receipt.originalLines
            .filter((o) => !receipt.lines.some((l) => l.materialId === o.materialId))
            .map((o) => (
              <li key={o.materialId} className="flex flex-col gap-1 p-3 text-muted-foreground">
                <span className="font-medium line-through">{o.name}</span>
                <span className="text-sm">было {formatQuantity(o.received, o.unit)} → 0</span>
              </li>
            ))}
        </ul>
      )}

      {receipt.status === "POSTED" && canPost && !receipt.correctedBy ? (
        <ReceiptCorrectionStart receiptId={receipt.id} needsApproval={receipt.needsApproval} />
      ) : null}
      {receipt.status === "CORRECTION_APPROVAL" ? (
        hasPermission(org, "goods_receipts.approve_correction") ? (
          <CorrectionDecision id={receipt.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Ожидает решения бухгалтера.</p>
        )
      ) : null}

      {receipt.approvals.length > 0 ? (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">История согласования</h2>
          {receipt.approvals.map((a, i) => (
            <p key={i}>
              {formatDateTime(a.at)} — {ACTION_LABELS[a.action] ?? a.action}
              {a.comment ? `: ${a.comment}` : ""}
            </p>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Фото</h2>
        <Attachments
          docType="GOODS_RECEIPT"
          docId={receipt.id}
          files={receipt.attachments}
          canUpload={canPost}
          revalidate={`/warehouse/receipts/${receipt.id}`}
          label="Добавить фото"
        />
      </section>
    </>
  );
}
