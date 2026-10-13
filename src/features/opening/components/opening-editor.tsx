"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentId } from "@/lib/idempotency";

import { saveOpening } from "../actions";
import { OPENING_KIND_LABELS, type OpeningInput, type OpeningKind } from "../schemas";

type Opt = { id: string; label: string };
type Line = Record<string, string>;

const EMPTY: Record<OpeningKind, Line> = {
  STOCK: { materialId: "", quantity: "" },
  CASH: { accountId: "", amount: "" },
  PAYABLES: { supplierId: "", projectId: "", amount: "", currency: "TJS", basis: "", dueDate: "" },
};

/** «Ввод остатков» (Д-61): склад — количества без цен; кассы — суммы; долги — поставщик, сумма, основание. */
export function OpeningEditor({
  kind,
  initial,
  projects,
  materials,
  accounts,
  suppliers,
}: {
  kind: OpeningKind;
  initial?: { id: string; docDate: string; projectId: string; note: string; lines: Line[] };
  projects: Opt[];
  materials: (Opt & { unit: string })[];
  accounts: (Opt & { currency: string })[];
  suppliers: Opt[];
}) {
  const router = useRouter();
  const id = useDocumentId(initial?.id);
  const [docDate, setDocDate] = useState(initial?.docDate ?? new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState(
    initial?.projectId ?? (projects.length === 1 ? projects[0]!.id : ""),
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines : [EMPTY[kind]]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (i: number, key: string, value: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveOpening({
        kind,
        id,
        docDate,
        projectId: kind === "STOCK" ? projectId : "",
        note,
        lines,
      } as OpeningInput);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Черновик сохранён");
      router.push(`/opening/${id}`);
    });
  }

  const unit = (materialId: string) => materials.find((m) => m.id === materialId)?.unit ?? "";
  const currency = (accountId: string) => accounts.find((a) => a.id === accountId)?.currency ?? "";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="docDate">Дата ввода остатков</Label>
          <Input
            id="docDate"
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
          />
        </div>
        {kind === "STOCK" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="project">Объект (склад)</Label>
            <NativeSelect
              id="project"
              placeholder="Выберите"
              value={projectId}
              disabled={Boolean(initial)}
              onChange={(e) => setProjectId(e.target.value)}
              options={projects.map((p) => ({ value: p.id, label: p.label }))}
            />
          </div>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            {kind === "STOCK" ? (
              <>
                <NativeSelect
                  aria-label={`Материал ${i + 1}`}
                  className="min-w-48 flex-1"
                  placeholder="Материал"
                  value={l.materialId}
                  onChange={(e) => set(i, "materialId", e.target.value)}
                  options={materials.map((m) => ({ value: m.id, label: m.label }))}
                />
                <Input
                  aria-label={`Количество ${i + 1}`}
                  inputMode="decimal"
                  className="w-32"
                  placeholder="Кол-во"
                  value={l.quantity}
                  onChange={(e) => set(i, "quantity", e.target.value)}
                />
                <span className="w-10 pb-2 text-sm text-muted-foreground">
                  {unit(l.materialId!)}
                </span>
              </>
            ) : kind === "CASH" ? (
              <>
                <NativeSelect
                  aria-label={`Касса ${i + 1}`}
                  className="min-w-48 flex-1"
                  placeholder="Касса / счёт"
                  value={l.accountId}
                  onChange={(e) => set(i, "accountId", e.target.value)}
                  options={accounts.map((a) => ({ value: a.id, label: a.label }))}
                />
                <Input
                  aria-label={`Сумма ${i + 1}`}
                  inputMode="decimal"
                  className="w-40"
                  placeholder="Сумма"
                  value={l.amount}
                  onChange={(e) => set(i, "amount", e.target.value)}
                />
                <span className="w-10 pb-2 text-sm text-muted-foreground">
                  {currency(l.accountId!)}
                </span>
              </>
            ) : (
              <>
                <NativeSelect
                  aria-label={`Поставщик ${i + 1}`}
                  className="min-w-48 flex-1"
                  placeholder="Поставщик"
                  value={l.supplierId}
                  onChange={(e) => set(i, "supplierId", e.target.value)}
                  options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
                />
                <Input
                  aria-label={`Сумма долга ${i + 1}`}
                  inputMode="decimal"
                  className="w-36"
                  placeholder="Сумма"
                  value={l.amount}
                  onChange={(e) => set(i, "amount", e.target.value)}
                />
                <NativeSelect
                  aria-label={`Валюта ${i + 1}`}
                  className="w-24"
                  value={l.currency}
                  onChange={(e) => set(i, "currency", e.target.value)}
                  options={["TJS", "USD", "RUB", "CNY"].map((c) => ({ value: c, label: c }))}
                />
                <Input
                  aria-label={`Основание ${i + 1}`}
                  className="min-w-56 flex-1"
                  placeholder="Основание (договор, акт сверки)"
                  value={l.basis}
                  onChange={(e) => set(i, "basis", e.target.value)}
                />
                <NativeSelect
                  aria-label={`Объект ${i + 1}`}
                  className="w-48"
                  placeholder="Объект —"
                  value={l.projectId}
                  onChange={(e) => set(i, "projectId", e.target.value)}
                  options={projects.map((p) => ({ value: p.id, label: p.label }))}
                />
                <Input
                  aria-label={`Срок оплаты ${i + 1}`}
                  type="date"
                  className="w-40"
                  value={l.dueDate}
                  onChange={(e) => set(i, "dueDate", e.target.value)}
                />
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Убрать строку"
              disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLines((ls) => [...ls, EMPTY[kind]])}
        >
          <Plus />
          Добавить строку
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">Примечание</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохранение…" : "Сохранить черновик"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {OPENING_KIND_LABELS[kind]}. Проводится как документ: после проведения изменить можно только
        сторно.
      </p>
    </form>
  );
}
