"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useObjectHref } from "@/components/object-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MaterialOption } from "@/features/shared/lookups";
import { formatQuantity } from "@/lib/format";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { quickReceive } from "../actions";
import type { ReceiveLine } from "../queries";

import { QtyInput } from "./qty-input";
import { SubmitBar } from "./submit-bar";

type Line = {
  purchaseRequestItemId: string;
  materialId: string;
  quantity: string;
  /** Без заявки: набранное наименование (подсказки по справочнику, Д-113). */
  text?: string;
};

/**
 * Приёмка (US-02): только фактические количества. Поставщика склад не указывает (Д-102) —
 * его вносит бухгалтер в накладной. По заявке — строки с остатком к приёмке, подставленным по умолчанию; склад правит фактическое
 * количество (можно больше заказанного — расхождение помечается; 0 — этого не привезли).
 * Без заявки — материалы вручную.
 */
export function ReceiveForm({
  projectId,
  request,
  materials,
}: {
  projectId: string;
  request?: { requestId: string; lines: ReceiveLine[] };
  materials?: MaterialOption[];
}) {
  const router = useRouter();
  const href = useObjectHref();
  const receiptId = useDocumentId();
  const { key } = useIdempotencyKey();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>(
    request
      ? request.lines.map((l) => ({
          purchaseRequestItemId: l.purchaseRequestItemId,
          materialId: l.materialId,
          quantity: l.remaining > 0 ? String(l.remaining).replace(".", ",") : "",
        }))
      : [{ purchaseRequestItemId: "", materialId: "", quantity: "" }],
  );
  const unitOf = new Map((materials ?? []).map((m) => [m.id, m.unit]));
  const byName = new Map((materials ?? []).map((m) => [m.name.trim().toLocaleLowerCase("ru"), m]));

  function setQty(index: number, quantity: string) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, quantity } : l)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickReceive({
        receiptId,
        key,
        projectId,
        requestId: request?.requestId ?? "",
        note: "",
        lines,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Приёмка ${result.data.number} проведена`);
      router.push(href(`/warehouse/receipts/${result.data.id}`));
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border">
        {lines.map((line, index) => {
          const info = request?.lines[index];
          return (
            <li key={index} className="flex flex-col gap-2 p-3">
              {info ? (
                <>
                  <span className="text-base font-medium">{info.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Заказано {formatQuantity(info.ordered, info.unit)} · принято ранее{" "}
                    {formatQuantity(info.received, info.unit)}
                  </span>
                  <QtyInput
                    unit={info.unit}
                    aria-label={`Принято: ${info.name}`}
                    value={line.quantity}
                    onChange={(e) => setQty(index, e.target.value)}
                  />
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <Input
                      aria-label={`Материал ${index + 1}`}
                      aria-invalid={Boolean(line.text?.trim()) && !line.materialId}
                      list="receive-materials"
                      className="h-12 text-base"
                      placeholder="Начните вводить материал"
                      autoComplete="off"
                      value={line.text ?? ""}
                      onChange={(e) => {
                        const text = e.target.value;
                        const m = byName.get(text.trim().toLocaleLowerCase("ru"));
                        setLines((ls) =>
                          ls.map((l, i) =>
                            i === index ? { ...l, text, materialId: m?.id ?? "" } : l,
                          ),
                        );
                      }}
                    />
                    {line.text?.trim() && !line.materialId ? (
                      <span className="text-xs text-destructive">
                        Выберите из подсказок. Нового материала нет в списке — внесите его строкой в
                        «Склад → Приход»
                      </span>
                    ) : null}
                  </div>
                  <QtyInput
                    unit={unitOf.get(line.materialId) ?? ""}
                    aria-label={`Количество ${index + 1}`}
                    value={line.quantity}
                    onChange={(e) => setQty(index, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Убрать строку"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!request ? (
        <datalist id="receive-materials">
          {(materials ?? []).map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
      ) : null}
      {!request ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setLines((ls) => [...ls, { purchaseRequestItemId: "", materialId: "", quantity: "" }])
          }
        >
          <Plus />
          Ещё материал
        </Button>
      ) : null}

      <SubmitBar pending={isPending} label="Провести приёмку" error={error} />
    </form>
  );
}
