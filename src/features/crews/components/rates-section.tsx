"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/catalog/components/form-dialog";
import type { Option } from "@/features/shared/lookups";
import { formatDate, formatMoney } from "@/lib/format";

import { saveWorkRate } from "../actions";
import type { RateRow } from "../queries";

function RateForm({
  crewId,
  projects,
  units,
  preset,
  today,
  onSaved,
}: {
  crewId: string;
  projects: Option[];
  units: Option[];
  preset?: RateRow;
  today: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [v, setV] = useState({
    projectId: preset?.projectId ?? "",
    workType: preset?.workType ?? "",
    unitId: preset?.unitId ?? "",
    rate: "",
    currency: preset?.currency ?? "TJS",
    validFrom: today,
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveWorkRate({ id, crewId, ...v });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Тариф сохранён");
      onSaved();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="rate-type">Вид работ</Label>
        <Input
          id="rate-type"
          placeholder="Например: Фасад"
          value={v.workType}
          onChange={(e) => setV({ ...v, workType: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rate-project">Объект</Label>
        <NativeSelect
          id="rate-project"
          placeholder="Все объекты"
          options={projects.map((p) => ({ value: p.id, label: p.label }))}
          value={v.projectId}
          onChange={(e) => setV({ ...v, projectId: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rate-value">Тариф</Label>
          <Input
            id="rate-value"
            inputMode="decimal"
            value={v.rate}
            onChange={(e) => setV({ ...v, rate: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rate-unit">За</Label>
          <NativeSelect
            id="rate-unit"
            placeholder="ед."
            options={units.map((u) => ({ value: u.id, label: u.label }))}
            value={v.unitId}
            onChange={(e) => setV({ ...v, unitId: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rate-currency">Валюта</Label>
          <Input
            id="rate-currency"
            maxLength={3}
            value={v.currency}
            onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rate-from">Действует с</Label>
        <Input
          id="rate-from"
          type="date"
          value={v.validFrom}
          onChange={(e) => setV({ ...v, validFrom: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Уже составленные акты сохраняют свой тариф — новый действует для актов с этой даты.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rate-note">Примечание (договор)</Label>
        <Input
          id="rate-note"
          value={v.note}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохранение…" : "Сохранить тариф"}
      </Button>
    </form>
  );
}

/** Договорные тарифы бригады с историей (Д-70). Новый тариф — только управляющий (Д-69). */
export function RatesSection({
  crewId,
  rates,
  projects,
  units,
  canManage,
  today,
}: {
  crewId: string;
  rates: RateRow[];
  projects: Option[];
  units: Option[];
  canManage: boolean;
  today: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Тарифы</h2>
        {canManage ? (
          <FormDialog
            trigger={
              <Button variant="outline" size="sm">
                <Plus />
                Новый тариф
              </Button>
            }
            title="Тариф бригады"
          >
            {(close) => (
              <RateForm
                crewId={crewId}
                projects={projects}
                units={units}
                today={today}
                onSaved={close}
              />
            )}
          </FormDialog>
        ) : null}
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Тарифов нет — без них акт не составить. Тарифы устанавливает управляющий.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {r.workType}: {formatMoney(r.rate, r.currency)} за {r.unit}
                </span>
                <span className="text-xs text-muted-foreground">
                  с {formatDate(r.validFrom)} · {r.projectLabel ?? "все объекты"}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </span>
              {canManage ? (
                <FormDialog
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={`Изменить тариф: ${r.workType}`}>
                      Изменить
                    </Button>
                  }
                  title="Новый тариф с даты"
                >
                  {(close) => (
                    <RateForm
                      crewId={crewId}
                      projects={projects}
                      units={units}
                      preset={r}
                      today={today}
                      onSaved={close}
                    />
                  )}
                </FormDialog>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
