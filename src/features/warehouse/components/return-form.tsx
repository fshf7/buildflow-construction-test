"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { toNumber } from "@/lib/decimal";
import { formatQuantity } from "@/lib/format";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { quickReturn } from "../actions";
import type { ReturnLine } from "../queries";

import { QtyInput } from "./qty-input";
import { SubmitBar } from "./submit-bar";

/** Возврат по выдаче (US-04): не больше выданного за вычетом уже возвращённого. */
export function ReturnForm({ issueId, lines }: { issueId: string; lines: ReturnLine[] }) {
  const router = useRouter();
  const returnId = useDocumentId();
  const { key } = useIdempotencyKey();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickReturn({
        returnId,
        key,
        issueId,
        lines: lines.map((l) => ({
          issueItemId: l.issueItemId,
          quantity: qty[l.issueItemId] ?? "",
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Возврат ${result.data.number} проведён`);
      router.push(`/warehouse/returns/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border">
        {lines.map((l) => {
          const value = qty[l.issueItemId] ?? "";
          const over = value !== "" && toNumber(value) > l.max;
          return (
            <li key={l.issueItemId} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{l.name}</span>
                <span
                  className={
                    over ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
                  }
                >
                  Выдано {formatQuantity(l.issued, l.unit)}
                  {l.returned > 0 ? `, возвращено ${formatQuantity(l.returned, l.unit)}` : ""} ·
                  можно вернуть {formatQuantity(l.max, l.unit)}
                </span>
              </span>
              <QtyInput
                unit={l.unit}
                aria-label={`Вернуть: ${l.name}`}
                aria-invalid={over}
                disabled={l.max <= 0}
                value={value}
                onChange={(e) => setQty((s) => ({ ...s, [l.issueItemId]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>
      <SubmitBar pending={isPending} label="Провести возврат" error={error} />
    </form>
  );
}
