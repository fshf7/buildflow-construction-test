"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { useObjectHref } from "@/components/object-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlockOption, Option } from "@/features/shared/lookups";
import { toNumber } from "@/lib/decimal";
import { formatQuantity } from "@/lib/format";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { quickIssue } from "../actions";
import type { Balance } from "../queries";

import { QtyInput } from "./qty-input";
import { SubmitBar } from "./submit-bar";

type Place = { crewId: string; blockId: string; floorId: string };

/**
 * Выдача бригаде (US-03): бригада, блок, этаж обязательны и запоминаются на этом устройстве
 * (обычно склад выдаёт одной бригаде на один участок несколько раз подряд). Только материалы с остатком.
 */
export function IssueForm({
  projectId,
  crews,
  blocks,
  balances,
}: {
  projectId: string;
  crews: Option[];
  blocks: BlockOption[];
  balances: Balance[];
}) {
  const router = useRouter();
  const href = useObjectHref();
  const issueId = useDocumentId();
  const { key } = useIdempotencyKey();
  const storageKey = `bf.issue.${projectId}`;
  const [place, setPlace] = useState<Place>({ crewId: "", blockId: "", floorId: "" });
  const [receivedBy, setReceivedBy] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Последний выбор бригады/блока/этажа — удобство на устройстве, не данные (localStorage может быть недоступен).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Place | null;
      // localStorage есть только в браузере: читаем после гидратации, иначе разметка сервера и клиента разойдётся.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && crews.some((c) => c.id === saved.crewId)) setPlace(saved);
    } catch {
      /* без сохранённого выбора */
    }
  }, [storageKey, crews]);

  const floors = blocks.find((b) => b.id === place.blockId)?.floors ?? [];
  const available = balances.filter((b) => b.quantity > 0);
  const shown = available.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickIssue({
        issueId,
        key,
        projectId,
        ...place,
        receivedByName: receivedBy,
        lines: available.map((b) => ({
          materialId: b.materialId,
          quantity: qty[b.materialId] ?? "",
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(place));
      } catch {
        /* не критично */
      }
      toast.success(`Выдача ${result.data.number} проведена`);
      router.push(href(`/warehouse/issues/${result.data.id}`));
    });
  }

  if (available.length === 0) {
    return <p className="text-muted-foreground">На складе нет материалов для выдачи.</p>;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="crew">Бригада</Label>
          <NativeSelect
            id="crew"
            className="h-11 text-base"
            placeholder="Выберите"
            options={crews.map((c) => ({ value: c.id, label: c.label }))}
            value={place.crewId}
            onChange={(e) => setPlace((p) => ({ ...p, crewId: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="block">Блок</Label>
          <NativeSelect
            id="block"
            className="h-11 text-base"
            placeholder="Выберите"
            options={blocks.map((b) => ({ value: b.id, label: b.name }))}
            value={place.blockId}
            onChange={(e) => setPlace((p) => ({ ...p, blockId: e.target.value, floorId: "" }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="floor">Этаж</Label>
          <NativeSelect
            id="floor"
            className="h-11 text-base"
            placeholder="Выберите"
            options={floors.map((f) => ({ value: f.id, label: f.name }))}
            value={place.floorId}
            onChange={(e) => setPlace((p) => ({ ...p, floorId: e.target.value }))}
          />
        </div>
      </div>
      {blocks.length === 0 ? (
        <p className="text-sm text-destructive">
          У объекта нет блоков и этажей — их заводит управляющий в разделе «Объекты».
        </p>
      ) : null}

      <Input
        type="search"
        placeholder="Поиск материала"
        aria-label="Поиск материала"
        className="h-11 text-base"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="flex flex-col divide-y rounded-lg border">
        {shown.map((b) => {
          const value = qty[b.materialId] ?? "";
          const over = value !== "" && toNumber(value) > b.quantity;
          return (
            <li key={b.materialId} className="flex items-center justify-between gap-3 p-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{b.name}</span>
                <span
                  className={
                    over ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
                  }
                >
                  На складе {formatQuantity(b.quantity, b.unit)}
                </span>
              </span>
              <QtyInput
                unit={b.unit}
                aria-label={`Выдать: ${b.name}`}
                aria-invalid={over}
                value={value}
                onChange={(e) => setQty((s) => ({ ...s, [b.materialId]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <Label htmlFor="receivedBy">Кто получил (необязательно)</Label>
        <Input
          id="receivedBy"
          className="h-11 text-base"
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
        />
      </div>

      <SubmitBar pending={isPending} label="Провести выдачу" error={error} />
    </form>
  );
}
