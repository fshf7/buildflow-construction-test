"use client";

import { X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { useObject, useObjectHref } from "@/components/object-context";
import { daysBefore, filterSheetRows, type SheetFilter } from "@/components/sheet/filter";
import {
  isTablePaste,
  RowStatus,
  sheetCell,
  sheetHead,
  sheetInput,
  sheetNavigate,
  sheetTable,
  sheetText,
} from "@/components/sheet/sheet-kit";
import { SheetToolbar } from "@/components/sheet/sheet-toolbar";
import { useRowSheet } from "@/components/sheet/use-row-sheet";
import { Button } from "@/components/ui/button";
import { parseRuDate, parseRuNumber } from "@/features/procurement/expenses";
import type { BlockOption, Option } from "@/features/shared/lookups";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { cancelServiceRow, saveServiceRow } from "../actions";
import { serviceRowFields } from "../schemas";
import type { ServiceDraft, ServiceUsageRow } from "../sheets";

export type ServiceOption = { id: string; name: string; unitId: string; unitCode: string };

const lower = (s: string) => s.trim().toLocaleLowerCase("ru");
const FIELDS: (keyof ServiceDraft)[] = [
  "docDate",
  "serviceId",
  "serviceName",
  "unitId",
  "quantity",
  "blockId",
  "floorId",
  "stageId",
  "crewId",
];

/**
 * «Услуги» склада (Д-100) как их лист: Дата · Услуга · Кол-во · Ед. · Блок · Этаж · Этап · Бригада.
 * Учёт того, где и кем использованы кран, экскаватор, геодезист, питание — без денег и остатков.
 */
export function ServicesSheet({
  rows,
  services,
  units,
  blocks,
  stages,
  crews,
  canEdit,
  canFixOld,
  today,
}: {
  rows: ServiceUsageRow[];
  services: ServiceOption[];
  units: Option[];
  blocks: BlockOption[];
  stages: Option[];
  crews: Option[];
  canEdit: boolean;
  canFixOld: boolean;
  today: string;
}) {
  const object = useObject();
  const href = useObjectHref();
  const [filter, setFilter] = useState<SheetFilter>({});
  const [isPending, startTransition] = useTransition();
  const approved = useRef(new Set<string>());
  const minDate = daysBefore(today, 7);
  const serviceByName = useMemo(() => new Map(services.map((s) => [lower(s.name), s])), [services]);
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const unitCode = (id: string) => units.find((u) => u.id === id)?.label.split(" — ")[0] ?? "";
  const labelOf = (list: Option[], id: string) => list.find((x) => x.id === id)?.label ?? "";

  const sheet = useRowSheet<ServiceDraft, ServiceDraft>({
    emptyDraft: () => ({
      id: crypto.randomUUID(),
      docDate: today,
      serviceId: "",
      serviceName: "",
      unitId: "",
      quantity: "",
      blockId: "",
      floorId: "",
      stageId: "",
      crewId: "",
    }),
    isBlank: (d) => !d.serviceName.trim() && !d.quantity,
    same: (a, b) => FIELDS.every((f) => a[f] === b[f]),
    validate: (d) => {
      const r = serviceRowFields.safeParse(d);
      if (r.success) return { ok: true, data: d };
      return {
        ok: false,
        fields: r.error.issues.map((i) => String(i.path[0])),
        message: `Заполните: ${[...new Set(r.error.issues.map((i) => i.message))].join(", ")}`,
      };
    },
    save: async (d, id) => {
      if (!d.serviceId && !approved.current.has(lower(d.serviceName))) {
        if (
          !window.confirm(
            `Добавить новую услугу «${d.serviceName.trim()}» (${unitCode(d.unitId)}) в справочник?`,
          )
        )
          return { ok: false, error: "Выберите услугу из списка или подтвердите новую" };
        approved.current.add(lower(d.serviceName));
      }
      const r = await saveServiceRow({ ...d, id, key: crypto.randomUUID(), projectId: object.id });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  });

  const visible = filterSheetRows(
    rows,
    filter,
    (r) => r.draft.docDate,
    (r) =>
      `${r.draft.serviceName} ${blockById.get(r.draft.blockId)?.name ?? ""} ${labelOf(stages, r.draft.stageId)} ${labelOf(crews, r.draft.crewId)}`,
  );
  const savedIds = new Set(rows.map((r) => r.id));
  const fresh = canEdit ? sheet.fresh.filter((d) => !savedIds.has(d.id)) : [];
  const pending = sheet.pendingNew(savedIds);

  function nameChange(value: string): Partial<ServiceDraft> {
    const s = serviceByName.get(lower(value));
    return s
      ? { serviceName: value, serviceId: s.id, unitId: s.unitId }
      : { serviceName: value, serviceId: "" };
  }

  function paste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!isTablePaste(text)) return;
    e.preventDefault();
    // Колонки их листа «Услуги»: Дата, Услуга, Кол-во, Блок, Этаж, Этап, Бригада.
    const drafts = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim() && !/^дата\t/i.test(l))
      .map((l): ServiceDraft => {
        const [date = "", name = "", qty = "", block = "", floor = "", stage = "", crew = ""] = l
          .split("\t")
          .map((s) => s.trim());
        const b = blocks.find((x) => lower(x.name) === lower(block));
        return {
          docDate: parseRuDate(date) ?? today,
          serviceId: "",
          serviceName: name,
          unitId: "",
          quantity: parseRuNumber(qty),
          blockId: b?.id ?? "",
          floorId: b?.floors.find((f) => lower(f.name) === lower(floor))?.id ?? "",
          stageId: stages.find((s) => lower(s.label) === lower(stage))?.id ?? "",
          crewId: crews.find((c) => crew && lower(c.label).startsWith(lower(crew)))?.id ?? "",
          ...nameChange(name),
        };
      });
    sheet.addPasted(drafts);
  }

  async function saveAll() {
    const names = [
      ...new Set(pending.filter((d) => !d.serviceId).map((d) => d.serviceName.trim())),
    ];
    if (names.length > 0) {
      if (!window.confirm(`Добавить в справочник новые услуги: ${names.join(", ")}?`)) return;
      for (const n of names) approved.current.add(lower(n));
    }
    for (const d of pending) await sheet.saveNew(d);
  }

  function cancel(row: ServiceUsageRow) {
    if (
      !window.confirm(
        `Отменить строку «${row.draft.serviceName}» от ${formatDate(row.draft.docDate)}?`,
      )
    )
      return;
    startTransition(async () => {
      const r = await cancelServiceRow(row.id);
      if (r.ok) toast.success("Строка отменена");
      else toast.error(r.error);
    });
  }

  function renderRow(d: ServiceDraft & { id: string }, row?: ServiceUsageRow) {
    const key = row?.key ?? d.id;
    const st = sheet.states[key];
    const old = row ? row.draft.docDate < minDate && !canFixOld : false;
    const locked = !canEdit || old;
    const bad = (f: string) => Boolean(st?.fields?.includes(f));
    const set = (patch: Partial<ServiceDraft>) =>
      row ? sheet.changeRow(row, patch) : sheet.changeNew(d.id, patch);
    const block = blockById.get(d.blockId);
    const isNew = !d.serviceId && d.serviceName.trim() !== "";
    return (
      <tr
        key={key}
        className={cn("border-b last:border-b-0", !row && "bg-primary/[0.03]")}
        onBlur={(e) => {
          if (locked || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          if (row) sheet.leaveRow(row);
          else sheet.leaveNew(d.id);
        }}
      >
        <td data-col="date" className={cn(sheetCell, "sticky left-0 z-[1] w-36 bg-background")}>
          {locked ? (
            <span className={sheetText}>{formatDate(d.docDate)}</span>
          ) : (
            <input
              type="date"
              aria-label="Дата"
              aria-invalid={bad("docDate")}
              className={sheetInput}
              value={d.docDate}
              onChange={(e) => set({ docDate: e.target.value })}
            />
          )}
        </td>
        <td data-col="name" className={cn(sheetCell, "min-w-56")}>
          {locked ? (
            <span className={sheetText}>{d.serviceName}</span>
          ) : (
            <input
              aria-label="Услуга"
              aria-invalid={bad("serviceName")}
              list="service-names"
              className={sheetInput}
              placeholder={row ? "" : "Новая строка — или вставьте из Excel (Ctrl+V)"}
              value={d.serviceName}
              onPaste={row ? undefined : paste}
              onChange={(e) => set(nameChange(e.target.value))}
            />
          )}
        </td>
        <td data-col="qty" className={cn(sheetCell, "w-24")}>
          {locked ? (
            <span className={cn(sheetText, "text-right tabular-nums")}>{d.quantity}</span>
          ) : (
            <input
              aria-label="Количество"
              aria-invalid={bad("quantity")}
              inputMode="decimal"
              className={cn(sheetInput, "text-right tabular-nums")}
              value={d.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          )}
        </td>
        <td data-col="unit" className={cn(sheetCell, "w-20")}>
          {locked || d.serviceId ? (
            <span className={sheetText}>{row?.unitCode || unitCode(d.unitId)}</span>
          ) : (
            <select
              aria-label="Единица"
              aria-invalid={bad("unitId")}
              className={sheetInput}
              value={d.unitId}
              onChange={(e) => set({ unitId: e.target.value })}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label.split(" — ")[0]}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="block" className={cn(sheetCell, "w-24")}>
          {locked ? (
            <span className={sheetText}>{block?.name ?? ""}</span>
          ) : (
            <select
              aria-label="Блок"
              aria-invalid={bad("blockId")}
              className={sheetInput}
              value={d.blockId}
              onChange={(e) => set({ blockId: e.target.value, floorId: "" })}
            >
              <option value="">—</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="floor" className={cn(sheetCell, "w-20")}>
          {locked ? (
            <span className={sheetText}>
              {block?.floors.find((f) => f.id === d.floorId)?.name ?? ""}
            </span>
          ) : (
            <select
              aria-label="Этаж"
              className={sheetInput}
              value={d.floorId}
              disabled={!block}
              onChange={(e) => set({ floorId: e.target.value })}
            >
              <option value="">—</option>
              {block?.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="stage" className={cn(sheetCell, "w-44")}>
          {locked ? (
            <span className={sheetText}>{labelOf(stages, d.stageId)}</span>
          ) : (
            <select
              aria-label="Этап"
              className={sheetInput}
              value={d.stageId}
              onChange={(e) => set({ stageId: e.target.value })}
            >
              <option value="">—</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="crew" className={cn(sheetCell, "w-52")}>
          {locked ? (
            <span className={sheetText}>{labelOf(crews, d.crewId)}</span>
          ) : (
            <select
              aria-label="Бригада"
              className={sheetInput}
              value={d.crewId}
              onChange={(e) => set({ crewId: e.target.value })}
            >
              <option value="">—</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className={cn(sheetCell, "w-16 text-center")}>
          <span className="inline-flex items-center gap-1">
            <RowStatus
              state={st}
              locked={Boolean(row) && canEdit && locked}
              lockedHint="Строка старше 7 дней — исправить может бухгалтер"
              warning={
                !row && isNew && !st ? "Новая услуга — будет добавлена в справочник" : undefined
              }
            />
            {row && !locked ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Отменить строку: ${d.serviceName}`}
                disabled={isPending}
                onClick={() => cancel(row)}
              >
                <X />
              </Button>
            ) : null}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SheetToolbar
        filter={filter}
        onFilter={setFilter}
        count={visible.length}
        exportHref={href("/warehouse/export?sheet=services")}
        pending={pending.length}
        onSavePending={() => void saveAll()}
      />
      <datalist id="service-names">
        {services.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className={sheetTable} onKeyDown={sheetNavigate}>
          <thead className="sticky top-0 z-[2] bg-muted">
            <tr>
              <th className={cn(sheetHead, "sticky left-0 z-[3] bg-muted")}>Дата</th>
              <th className={sheetHead}>Услуга</th>
              <th className={cn(sheetHead, "text-right")}>Кол-во</th>
              <th className={sheetHead}>Ед.</th>
              <th className={sheetHead}>Блок</th>
              <th className={sheetHead}>Этаж</th>
              <th className={sheetHead}>Этап</th>
              <th className={sheetHead}>Бригада</th>
              <th className={sheetHead} />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => renderRow({ ...sheet.draftOf(r), id: r.id }, r))}
            {fresh.map((d) => renderRow(d))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <p className="text-xs text-muted-foreground">
          Учёт использования услуг (кран, экскаватор, геодезист, питание) по блокам и этапам. Строка
          сохраняется, когда вы уходите с неё; деньги по услугам — в накладных бухгалтера.
        </p>
      ) : null}
    </div>
  );
}
