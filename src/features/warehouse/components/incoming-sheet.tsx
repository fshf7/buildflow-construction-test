"use client";

import { useMemo, useRef, useState } from "react";

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
import { parseRuDate, parseRuNumber } from "@/features/procurement/expenses";
import type { MaterialOption, Option } from "@/features/shared/lookups";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveReceiptRow } from "../actions";
import { receiptRowFields } from "../schemas";
import type { IncomingDraft, IncomingRow } from "../sheets";

const lower = (s: string) => s.trim().toLocaleLowerCase("ru");
const FIELDS: (keyof IncomingDraft)[] = [
  "docDate",
  "materialId",
  "materialName",
  "unitId",
  "quantity",
  "supplierId",
];

/**
 * «Приход» склада (Д-100) как их лист в Google Таблице: Дата · Наименование · Кол-во · Ед. изм.
 * Поставщика склад не вводит (Д-102) — его вносит бухгалтер в накладной. Строка проводится, когда уходишь с неё (остаток растёт сразу);
 * новое наименование добавляется в справочник после подтверждения. Исправление в ячейке —
 * корректировка приёмки (до 7 дней — склад, старше — бухгалтер).
 */
export function IncomingSheet({
  rows,
  materials,
  units,
  canEdit,
  canFixOld,
  today,
}: {
  rows: IncomingRow[];
  materials: MaterialOption[];
  units: Option[];
  canEdit: boolean;
  canFixOld: boolean;
  today: string;
}) {
  const object = useObject();
  const href = useObjectHref();
  const [filter, setFilter] = useState<SheetFilter>({});
  const approved = useRef(new Set<string>());
  const materialByName = useMemo(
    () => new Map(materials.map((m) => [lower(m.name), m])),
    [materials],
  );
  const unitCode = (u: Option) => u.label.split(" — ")[0]!;
  const minDate = daysBefore(today, 7);

  const sheet = useRowSheet<IncomingDraft, IncomingDraft>({
    emptyDraft: () => ({
      id: crypto.randomUUID(),
      docDate: today,
      materialId: "",
      materialName: "",
      unitId: "",
      quantity: "",
      supplierId: "",
    }),
    isBlank: (d) => !d.materialName.trim() && !d.quantity,
    same: (a, b) => FIELDS.every((f) => a[f] === b[f]),
    validate: (d) => {
      const r = receiptRowFields.safeParse(d);
      if (r.success) return { ok: true, data: d };
      const fields = r.error.issues.map((i) => String(i.path[0]));
      return {
        ok: false,
        fields,
        message: `Заполните: ${[...new Set(r.error.issues.map((i) => i.message))].join(", ")}`,
      };
    },
    save: async (d, id) => {
      // Новое наименование — в справочник только после подтверждения (без опечаток-дублей).
      if (!d.materialId && !approved.current.has(lower(d.materialName))) {
        const unit = units.find((u) => u.id === d.unitId);
        const yes = window.confirm(
          `Добавить новый материал «${d.materialName.trim()}» (${unit ? unitCode(unit) : ""}) в справочник?`,
        );
        if (!yes) return { ok: false, error: "Выберите материал из списка или подтвердите новый" };
        approved.current.add(lower(d.materialName));
      }
      const r = await saveReceiptRow({
        ...d,
        id,
        key: crypto.randomUUID(),
        projectId: object.id,
      });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  });

  const visible = filterSheetRows(
    rows,
    filter,
    (r) => r.draft.docDate,
    (r) => `${r.draft.materialName} ${r.number ?? ""} ${r.requestNumber ?? ""}`,
  );
  const savedIds = new Set(rows.map((r) => r.id));
  const fresh = canEdit ? sheet.fresh.filter((d) => !savedIds.has(d.id)) : [];
  const pending = sheet.pendingNew(savedIds);

  function nameChange(value: string): Partial<IncomingDraft> {
    const m = materialByName.get(lower(value));
    return m
      ? { materialName: value, materialId: m.id, unitId: m.unitId }
      : { materialName: value, materialId: "" };
  }

  function paste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!isTablePaste(text)) return;
    e.preventDefault();
    // Колонки их листа «Приход»: Дата, Наименование, Кол-во, Ед.изм (Поставщик — не берём, Д-102).
    const drafts = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim() && !/^дата\t/i.test(l))
      .map((l) => {
        const [date = "", name = "", qty = "", unit = ""] = l.split("\t").map((s) => s.trim());
        const u = units.find((x) => lower(unitCode(x)) === lower(unit));
        const base: IncomingDraft = {
          docDate: parseRuDate(date) ?? today,
          materialId: "",
          materialName: name,
          unitId: u?.id ?? "",
          quantity: parseRuNumber(qty),
          supplierId: "",
        };
        return {
          ...base,
          ...nameChange(name),
          unitId: materialByName.get(lower(name))?.unitId ?? base.unitId,
        };
      });
    sheet.addPasted(drafts);
  }

  async function saveAll() {
    const names = [
      ...new Set(pending.filter((d) => !d.materialId).map((d) => d.materialName.trim())),
    ];
    if (names.length > 0) {
      if (!window.confirm(`Добавить в справочник новые материалы: ${names.join(", ")}?`)) return;
      for (const n of names) approved.current.add(lower(n));
    }
    for (const d of pending) await sheet.saveNew(d);
  }

  function renderRow(d: IncomingDraft & { id: string }, row?: IncomingRow) {
    const key = row?.key ?? d.id;
    const st = sheet.states[key];
    const old = row ? row.draft.docDate < minDate && !canFixOld : false;
    const locked = !canEdit || (row ? !row.editable || old : false);
    const bad = (f: string) => Boolean(st?.fields?.includes(f));
    const set = (patch: Partial<IncomingDraft>) =>
      row ? sheet.changeRow(row, patch) : sheet.changeNew(d.id, patch);
    const unitLocked = Boolean(d.materialId);
    const isNewMaterial = !d.materialId && d.materialName.trim() !== "";
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
        <td data-col="name" className={cn(sheetCell, "min-w-64")}>
          {locked ? (
            <span className={sheetText}>{d.materialName}</span>
          ) : (
            <input
              aria-label="Наименование"
              aria-invalid={bad("materialName")}
              list="incoming-materials"
              className={sheetInput}
              placeholder={row ? "" : "Новая строка — или вставьте из Excel (Ctrl+V)"}
              title={
                isNewMaterial
                  ? "Нового наименования нет в справочнике — будет добавлено"
                  : undefined
              }
              value={d.materialName}
              onPaste={row ? undefined : paste}
              onChange={(e) => set(nameChange(e.target.value))}
            />
          )}
        </td>
        <td data-col="qty" className={cn(sheetCell, "w-28")}>
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
        <td data-col="unit" className={cn(sheetCell, "w-24")}>
          {locked || unitLocked ? (
            <span className={sheetText}>
              {row?.unitCode || units.find((u) => u.id === d.unitId)?.label.split(" — ")[0] || ""}
            </span>
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
                  {unitCode(u)}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className={cn(sheetCell, "w-32 px-2 text-xs text-muted-foreground")}>
          {row?.requestNumber ?? ""}
        </td>
        <td className={cn(sheetCell, "w-10 text-center")}>
          <RowStatus
            state={st}
            locked={Boolean(row) && canEdit && locked}
            lockedHint={
              old
                ? "Строка старше 7 дней — исправить может бухгалтер"
                : "Несколько строк в одной приёмке — исправление в карточке приёмки"
            }
            warning={
              !row && isNewMaterial && !st
                ? "Новое наименование — будет добавлено в справочник"
                : undefined
            }
          />
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
        exportHref={href("/warehouse/export?sheet=incoming")}
        pending={pending.length}
        onSavePending={() => void saveAll()}
      />
      <datalist id="incoming-materials">
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className={sheetTable} onKeyDown={sheetNavigate}>
          <thead className="sticky top-0 z-[2] bg-muted">
            <tr>
              <th className={cn(sheetHead, "sticky left-0 z-[3] bg-muted")}>Дата</th>
              <th className={sheetHead}>Наименование</th>
              <th className={cn(sheetHead, "text-right")}>Кол-во</th>
              <th className={sheetHead}>Ед. изм.</th>
              <th className={sheetHead}>Заявка</th>
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
          Строка проводится, когда вы уходите с неё (Tab, Enter, мышью) — остаток растёт сразу.
          Строки можно вставить из Excel или Google Таблиц (Ctrl+V в пустую строку). Исправить
          строку можно в течение 7 дней — система сделает корректировку приёмки.
        </p>
      ) : null}
    </div>
  );
}
