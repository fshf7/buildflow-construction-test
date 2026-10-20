"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useObjectHref } from "@/components/object-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDocumentId } from "@/lib/idempotency";

import { startReceiptCorrection } from "../actions";

/** «Исправить» (Д-06) или «Сторнировать» (Д-52) проведённую приёмку — причина обязательна. */
export function ReceiptCorrectionStart({
  receiptId,
  needsApproval,
}: {
  receiptId: string;
  needsApproval: boolean;
}) {
  const router = useRouter();
  const href = useObjectHref();
  const newId = useDocumentId();
  const [mode, setMode] = useState<"edit" | "reverse" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    if (reason.trim().length < 3) {
      setError("Укажите причину (не короче 3 символов)");
      return;
    }
    startTransition(async () => {
      const result = await startReceiptCorrection({ originalId: receiptId, newId, reason, mode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(href(`/warehouse/receipts/${result.data.id}`));
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode("edit")}>
          Исправить количества
        </Button>
        <Button variant="outline" onClick={() => setMode("reverse")}>
          Сторнировать приёмку
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {mode === "reverse" ? "Сторно приёмки" : "Исправление приёмки"}
              </DialogTitle>
              <DialogDescription>
                {mode === "reverse"
                  ? "Приёмка будет отменена целиком: остаток уменьшится на принятое."
                  : "Создастся исправленная приёмка — исходная останется в истории."}{" "}
                {needsApproval ? "Заявка уже на сверке — потребуется согласование бухгалтера." : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="correction-reason">Причина</Label>
              <textarea
                id="correction-reason"
                rows={3}
                className="rounded-md border bg-background p-2 text-base"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "…" : "Продолжить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
