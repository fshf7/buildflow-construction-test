"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { toNumber } from "@/lib/decimal";
import { formatQuantity } from "@/lib/format";

import { quickReturn } from "../actions";

import { QtyInput } from "./qty-input";

/**
 * «Вернуть» прямо из строки «Расхода» (Д-103): возврат по этой выдаче и этому материалу — та же
 * проводка, что «Остатки → Вернуть». После проведения в «Расходе» появляется строка с минусом.
 */
export function ReturnRowButton({
  issueId,
  issueItemId,
  materialName,
  unit,
  returnable,
}: {
  issueId: string;
  issueItemId: string;
  materialName: string;
  unit: string;
  returnable: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Новые id на каждое открытие: повтор отправки в том же окне не создаст второй возврат.
  const [ids, setIds] = useState({ returnId: "", key: "" });
  const [isPending, startTransition] = useTransition();
  const over = quantity !== "" && toNumber(quantity) > returnable;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setIds({ returnId: crypto.randomUUID(), key: crypto.randomUUID() });
      setQuantity("");
      setError(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickReturn({
        ...ids,
        issueId,
        lines: [{ issueItemId, quantity }],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Возврат ${result.data.number} проведён`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Вернуть: ${materialName}`}
          title="Вернуть на склад"
        >
          <Undo2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Возврат: {materialName}</DialogTitle>
            <DialogDescription>
              Можно вернуть до {formatQuantity(returnable, unit)}. Остаток склада вырастет сразу, в
              «Расходе» появится строка с минусом.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={over}>
            <FieldLabel htmlFor="return-qty">Сколько вернули</FieldLabel>
            <QtyInput
              id="return-qty"
              unit={unit}
              aria-invalid={over}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !quantity || over}>
              {isPending ? "Проводится…" : "Провести возврат"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
