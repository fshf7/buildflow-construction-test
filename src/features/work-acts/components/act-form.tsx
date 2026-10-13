"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentRates, lineAmount } from "@/features/crews/rates";
import type { RateRow } from "@/features/crews/queries";
import type { BlockOption, Option } from "@/features/shared/lookups";
import { QtyInput } from "@/features/warehouse/components/qty-input";
import { SubmitBar } from "@/features/warehouse/components/submit-bar";
import { toNumber } from "@/lib/decimal";
import { formatMoney, formatQuantity } from "@/lib/format";

import { saveWorkActDraft } from "../actions";

type Line = {
  key: string;
  workType: string;
  blockId: string;
  floorId: string;
  quantity: string;
  note: string;
};

export type ActFormInitial = {
  id: string;
  crewId: string;
  docDate: string;
  periodFrom: string;
  periodTo: string;
  note: string;
  lines: Omit<Line, "key">[];
};

const emptyLine = (): Line => ({
  key: crypto.randomUUID(),
  workType: "",
  blockId: "",
  floorId: "",
  quantity: "",
  note: "",
});

/**
 * Акт выполненных работ (BP-05, US-07) — mobile-first: бригада → строки (вид работ из тарифов,
 * блок, этаж, объём). Сумма = объём × действующий тариф; в акт тариф подставляет БД (Д-70).
 */
export function ActForm({
  projectId,
  crews,
  rates,
  blocks,
  today,
  initial,
}: {
  projectId: string;
  crews: Option[];
  rates: RateRow[];
  blocks: BlockOption[];
  today: string;
  initial?: ActFormInitial;
}) {
  const router = useRouter();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [crewId, setCrewId] = useState(initial?.crewId ?? (crews.length === 1 ? crews[0]!.id : ""));
  const [docDate, setDocDate] = useState(initial?.docDate ?? today);
  const [periodFrom, setPeriodFrom] = useState(initial?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(initial?.periodTo ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({ ...l, key: crypto.randomUUID() }))
      : [emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const available = crewId ? currentRates(rates, crewId, projectId, docDate || today) : [];
  const rateOf = (workType: string) => available.find((r) => r.workType === workType);
  const amounts = lines.map((l) => {
    const r = rateOf(l.workType);
    const q = l.quantity ? toNumber(l.quantity) : NaN;
    return r && Number.isFinite(q) && q > 0 ? lineAmount(q, r.rate) : 0;
  });
  const total = Math.round(amounts.reduce((s, a) => s + a * 100, 0)) / 100;
  const currency = available[0]?.currency ?? "TJS";

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveWorkActDraft({
        id,
        projectId,
        crewId,
        docDate,
        periodFrom,
        periodTo,
        note,
        lines: lines.filter((l) => l.workType || l.quantity).map(({ key: _key, ...l }) => l),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Черновик акта сохранён");
      router.push(`/crews/acts/${id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="act-crew">Бригада</Label>
          <NativeSelect
            id="act-crew"
            className="h-11 text-base"
            placeholder="Выберите"
            options={crews.map((c) => ({ value: c.id, label: c.label }))}
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="act-date">Дата акта</Label>
          <Input
            id="act-date"
            type="date"
            className="h-11 text-base"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="act-from">Период с</Label>
          <Input
            id="act-from"
            type="date"
            className="h-11 text-base"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="act-to">по</Label>
          <Input
            id="act-to"
            type="date"
            className="h-11 text-base"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </div>
      </div>

      {crewId && available.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          У бригады нет действующих тарифов на этом объекте — попросите управляющего установить
          тариф.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {lines.map((l, i) => {
          const rate = rateOf(l.workType);
          const floors = blocks.find((b) => b.id === l.blockId)?.floors ?? [];
          return (
            <li key={l.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Работа {i + 1}</span>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Удалить работу ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
              <NativeSelect
                aria-label={`Вид работ ${i + 1}`}
                className="h-11 text-base"
                placeholder="Вид работ"
                options={available.map((r) => ({
                  value: r.workType,
                  label: `${r.workType} — ${formatMoney(r.rate, r.currency)}/${r.unit}`,
                }))}
                value={l.workType}
                onChange={(e) => update(l.key, { workType: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NativeSelect
                  aria-label={`Блок ${i + 1}`}
                  className="h-11 text-base"
                  placeholder="Блок —"
                  options={blocks.map((b) => ({ value: b.id, label: b.name }))}
                  value={l.blockId}
                  onChange={(e) => update(l.key, { blockId: e.target.value, floorId: "" })}
                />
                <NativeSelect
                  aria-label={`Этаж ${i + 1}`}
                  className="h-11 text-base"
                  placeholder="Этаж —"
                  options={floors.map((f) => ({ value: f.id, label: f.name }))}
                  value={l.floorId}
                  onChange={(e) => update(l.key, { floorId: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <QtyInput
                  unit={rate?.unit ?? ""}
                  aria-label={`Объём ${i + 1}`}
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                />
                <span className="text-sm tabular-nums" data-testid={`line-amount-${i + 1}`}>
                  {rate && amounts[i]
                    ? `${formatQuantity(toNumber(l.quantity), rate.unit)} × ${formatMoney(rate.rate, rate.currency)} = ${formatMoney(amounts[i], rate.currency)}`
                    : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        onClick={() => setLines((ls) => [...ls, emptyLine()])}
      >
        <Plus />
        Добавить работу
      </Button>

      <div className="flex flex-col gap-1">
        <Label htmlFor="act-note">Примечание</Label>
        <Input
          id="act-note"
          className="h-11 text-base"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
        Итого по акту: <b data-testid="act-total">{formatMoney(total, currency)}</b>
      </div>

      <SubmitBar pending={isPending} label="Сохранить черновик" error={error} />
    </form>
  );
}
