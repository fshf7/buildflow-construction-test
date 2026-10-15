"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";
import { formatQuantity } from "@/lib/format";
import type { MaterialOption, Option } from "@/features/shared/lookups";

import { quickReceive } from "../actions";
import type { ReceiveLine } from "../queries";

import { QtyInput } from "./qty-input";
import { SubmitBar } from "./submit-bar";

type Line = { purchaseRequestItemId: string; materialId: string; quantity: string };

/**
 * Приёмка (US-02). Поставщика склад выбирает здесь — по документам машины (в заявке его нет, Д-92).
 * По заявке — строки с остатком к приёмке, подставленным по умолчанию; склад правит фактическое
 * количество (можно больше заказанного — расхождение помечается; 0 — этого не привезли).
 * Без заявки — материалы вручную.
 */
export function ReceiveForm({
  projectId,
  request,
  suppliers,
  materials,
}: {
  projectId: string;
  request?: { requestId: string; lines: ReceiveLine[] };
  suppliers: Option[];
  materials?: MaterialOption[];
}) {
  const router = useRouter();
  const receiptId = useDocumentId();
  const { key } = useIdempotencyKey();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState("");
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
        supplierId,
        requestId: request?.requestId ?? "",
        note: "",
        lines,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Приёмка ${result.data.number} проведена`);
      router.push(`/warehouse/receipts/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="supplier">Поставщик</Label>
        <NativeSelect
          id="supplier"
          className="h-11 text-base"
          placeholder="Выберите поставщика"
          options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        />
      </div>

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
                <div className="flex items-end gap-2">
                  <NativeSelect
                    aria-label={`Материал ${index + 1}`}
                    className="h-12 flex-1 text-base"
                    placeholder="Материал"
                    options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))}
                    value={line.materialId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, i) => (i === index ? { ...l, materialId: e.target.value } : l)),
                      )
                    }
                  />
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
