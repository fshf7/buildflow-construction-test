"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { useIdempotencyKey } from "@/lib/idempotency";

import { finishReceiptCorrection } from "../actions";
import type { ReceiptDetail } from "../queries";

import { QtyInput } from "./qty-input";
import { SubmitBar } from "./submit-bar";

/** Черновик корректировки: новые количества (0 — строку убрать) и причина. */
export function CorrectionForm({ receipt }: { receipt: ReceiptDetail }) {
  const router = useRouter();
  const { key } = useIdempotencyKey();
  // Строки исходной приёмки — основа; в черновике сторно их нет (все нули).
  const base = receipt.lines.length > 0 ? receipt.lines : [];
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(base.map((l) => [l.id, String(l.received).replace(".", ",")])),
  );
  const [reason, setReason] = useState(receipt.correctionReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await finishReceiptCorrection({
        id: receipt.id,
        key,
        projectId: receipt.projectId,
        reason,
        lines: base.map((l) => ({
          purchaseRequestItemId: l.purchaseRequestItemId ?? "",
          materialId: l.materialId,
          quantity: qty[l.id] ?? "",
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        result.data.status === "CORRECTION_APPROVAL"
          ? "Отправлено на согласование бухгалтеру"
          : "Корректировка проведена",
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {base.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {base.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 p-3">
              <span className="font-medium">{l.name}</span>
              <QtyInput
                unit={l.unit}
                aria-label={`Исправленное количество: ${l.name}`}
                value={qty[l.id] ?? ""}
                onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm">
          Сторно: приёмка будет отменена целиком, остаток уменьшится на всё принятое.
        </p>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="reason">Причина</Label>
        <textarea
          id="reason"
          rows={2}
          className="rounded-md border bg-background p-2 text-base"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <SubmitBar
        pending={isPending}
        label={receipt.needsApproval ? "Отправить на согласование" : "Провести корректировку"}
        error={error}
      />
    </form>
  );
}
