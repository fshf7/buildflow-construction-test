"use client";

import { useMemo, useState } from "react";

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
import type { BlockOption, MaterialOption, Option } from "@/features/shared/lookups";
import { toNumber } from "@/lib/decimal";
import { formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveIssueRow } from "../actions";
import type { Balance } from "../queries";
import { issueRowFields } from "../schemas";
import { outgoingName } from "../sheet-labels";
import type { NormUsage, OutgoingDraft, OutgoingRow } from "../sheets";

import { ReturnRowButton } from "./return-row-button";

const lower = (s: string) => s.trim().toLocaleLowerCase("ru");
const FIELDS: (keyof OutgoingDraft)[] = [
  "docDate",
  "materialId",
  "quantity",
  "blockId",
  "floorId",
  "stageId",
  "crewId",
];
const normKey = (m: string, b: string, s: string) => `${m}:${b}:${s}`;

/**
 * «Расход» склада (Д-100) как их лист: Дата · Наименование · Блок · Этаж · Этап · Кол-во ·
 * Норматив · Остаток норматива · Ответственный (бригадир). Строка проводится при уходе с неё
 * (в минус — нельзя); исправление в ячейке — сторно исходной выдачи и новая (до 7 дней).
 * Возвраты — строки с минусом (Д-103); «Вернуть» — кнопкой в строке выдачи.
 */
export function OutgoingSheet({
  rows,
  materials,
  balances,
  blocks,
  stages,
  crews,
  norms,
  canEdit,
  canFixOld,
  today,
}: {
  rows: OutgoingRow[];
  materials: MaterialOption[];
  balances: Balance[];
  blocks: BlockOption[];
  stages: Option[];
  crews: Option[];
  norms: NormUsage[];
  canEdit: boolean;
  canFixOld: boolean;
  today: string;
}) {
  const object = useObject();
  const href = useObjectHref();
  const [filter, setFilter] = useState<SheetFilter>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const minDate = daysBefore(today, 7);

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const materialByName = useMemo(
    () => new Map(materials.map((m) => [lower(m.name), m])),
    [materials],
  );
  const stock = useMemo(() => new Map(balances.map((b) => [b.materialId, b.quantity])), [balances]);
  const norm = useMemo(
    () => new Map(norms.map((n) => [normKey(n.materialId, n.blockId, n.stageId), n])),
    [norms],
  );
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const labelOf = (list: Option[], id: string) => list.find((x) => x.id === id)?.label ?? "";

  const sheet = useRowSheet<OutgoingDraft, OutgoingDraft>({
    emptyDraft: () => ({
      id: crypto.randomUUID(),
      docDate: today,
      materialId: "",
      quantity: "",
      blockId: "",
      floorId: "",
      stageId: "",
      crewId: "",
    }),
    isBlank: (d) => !d.materialId && !d.quantity && !d.crewId,
    same: (a, b) => FIELDS.every((f) => a[f] === b[f]),
    validate: (d) => {
      const r = issueRowFields.safeParse(d);
      if (r.success) return { ok: true, data: d };
      return {
        ok: false,
        fields: r.error.issues.map((i) => String(i.path[0])),
        message: `Заполните: ${[...new Set(r.error.issues.map((i) => i.message))].join(", ")}`,
      };
    },
    save: async (d, id) => {
      const r = await saveIssueRow({ ...d, id, key: crypto.randomUUID(), projectId: object.id });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  });

  const visible = filterSheetRows(
    rows,
    filter,
    (r) => r.draft.docDate,
    (r) =>
      `${outgoingName(r)} ${blockById.get(r.draft.blockId)?.name ?? ""} ${labelOf(stages, r.draft.stageId)} ${labelOf(crews, r.draft.crewId)} ${r.number ?? ""} ${r.issueNumber ?? ""}`,
  );
  const savedIds = new Set(rows.map((r) => r.id));
  const fresh = canEdit ? sheet.fresh.filter((d) => !savedIds.has(d.id)) : [];
  const pending = sheet.pendingNew(savedIds);

  function paste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!isTablePaste(text)) return;
    e.preventDefault();
    // Колонки их листа «Расход»: Дата, Наименование, Блок, Этаж, Этап, Кол-во, [Норматив], Ответственный.
    const pastedNames: Record<string, string> = {};
    const drafts = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim() && !/^дата\t/i.test(l))
      .map((l): OutgoingDraft & { id: string } => {
        const c = l.split("\t").map((s) => s.trim());
        const [date = "", name = "", block = "", floor = "", stage = "", qty = ""] = c;
        const who = c[7] ?? c[6] ?? "";
        const b = blocks.find((x) => lower(x.name) === lower(block));
        const f = b?.floors.find((x) => lower(x.name) === lower(floor));
        const crew =
          crews.find((x) => lower(x.label) === lower(who)) ??
          crews.find((x) => who && lower(x.label).startsWith(lower(who)));
        const id = crypto.randomUUID();
        pastedNames[id] = name; // ненайденное наименование видно в ячейке — подсвечено ошибкой
        return {
          id,
          docDate: parseRuDate(date) ?? today,
          materialId: materialByName.get(lower(name))?.id ?? "",
          quantity: parseRuNumber(qty),
          blockId: b?.id ?? "",
          floorId: f?.id ?? "",
          stageId: stages.find((x) => lower(x.label) === lower(stage))?.id ?? "",
          crewId: crew?.id ?? "",
        };
      });
    setNames((x) => ({ ...x, ...pastedNames }));
    sheet.addPasted(drafts);
  }

  async function saveAll() {
    for (const d of pending) await sheet.saveNew(d);
  }

  function renderRow(d: OutgoingDraft & { id: string }, row?: OutgoingRow) {
    const key = row?.key ?? d.id;
    const st = sheet.states[key];
    const isReturn = row?.kind === "return";
    const old = row && !isReturn ? row.draft.docDate < minDate && !canFixOld : false;
    const locked = !canEdit || (row ? !row.editable || old : false);
    const bad = (f: string) => Boolean(st?.fields?.includes(f));
    const set = (patch: Partial<OutgoingDraft>) =>
      row ? sheet.changeRow(row, patch) : sheet.changeNew(d.id, patch);
    const material = materialById.get(d.materialId);
    const block = blockById.get(d.blockId);
    const n =
      d.blockId && d.stageId && !isReturn
        ? norm.get(normKey(d.materialId, d.blockId, d.stageId))
        : undefined;
    // Остаток норматива: у сохранённой строки выдача уже учтена; у новой — вычитаем вводимое.
    const pendingQty = !row && d.quantity ? toNumber(d.quantity) : 0;
    const left =
      n?.norm != null ? n.norm - n.issued - (Number.isFinite(pendingQty) ? pendingQty : 0) : null;
    const nameValue = names[key] ?? material?.name ?? row?.materialName ?? "";
    return (
      <tr
        key={key}
        className={cn(
          "border-b last:border-b-0",
          !row && "bg-primary/[0.03]",
          isReturn && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
        )}
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
            <span
              className={sheetText}
              title={
                isReturn
                  ? `Возврат ${row?.number ?? ""} по выдаче ${row?.issueNumber ?? ""}`
                  : undefined
              }
            >
              {row ? outgoingName(row) : ""}
            </span>
          ) : (
            <input
              aria-label="Наименование"
              aria-invalid={bad("materialId")}
              list="outgoing-materials"
              className={sheetInput}
              placeholder={row ? "" : "Новая строка — или вставьте из Excel (Ctrl+V)"}
              value={nameValue}
              onPaste={row ? undefined : paste}
              onChange={(e) => {
                setNames((x) => ({ ...x, [key]: e.target.value }));
                set({ materialId: materialByName.get(lower(e.target.value))?.id ?? "" });
              }}
            />
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
        <td data-col="qty" className={cn(sheetCell, "w-24")}>
          {locked ? (
            <span className={cn(sheetText, "text-right tabular-nums", isReturn && "font-medium")}>
              {d.quantity.replace("-", "−")}
            </span>
          ) : (
            <input
              aria-label="Количество"
              aria-invalid={bad("quantity")}
              inputMode="decimal"
              className={cn(sheetInput, "text-right tabular-nums")}
              title={
                material
                  ? `На складе: ${formatQuantity(stock.get(material.id) ?? 0, material.unit)}`
                  : undefined
              }
              value={d.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          )}
        </td>
        <td className={cn(sheetCell, "w-24 px-2 text-right text-muted-foreground tabular-nums")}>
          {n?.norm != null ? formatQuantity(n.norm) : ""}
        </td>
        <td
          className={cn(
            sheetCell,
            "w-28 px-2 text-right tabular-nums",
            left !== null && left < 0 && "bg-destructive/10 font-medium text-destructive",
          )}
          title={left !== null && left < 0 ? "Перерасход норматива" : undefined}
        >
          {left !== null ? formatQuantity(Math.round(left * 10000) / 10000) : ""}
        </td>
        <td data-col="crew" className={cn(sheetCell, "w-56")}>
          {locked ? (
            <span className={sheetText}>{labelOf(crews, d.crewId)}</span>
          ) : (
            <select
              aria-label="Ответственный"
              aria-invalid={bad("crewId")}
              className={sheetInput}
              value={d.crewId}
              onChange={(e) => set({ crewId: e.target.value })}
            >
              <option value="">Бригадир</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </td>
        {/* Закреплена справа, как дата слева: замок и «Вернуть» видны без прокрутки. */}
        <td
          className={cn(
            sheetCell,
            "sticky right-0 z-[1] w-16 border-l px-1",
            isReturn ? "bg-emerald-50 dark:bg-emerald-950" : "bg-background",
          )}
        >
          <div className="flex items-center justify-center gap-1">
            <RowStatus
              state={st}
              locked={Boolean(row) && canEdit && locked}
              lockedHint={
                isReturn
                  ? "Возврат — отменяется сторно в карточке возврата"
                  : old
                    ? "Строка старше 7 дней — исправить может бухгалтер"
                    : row?.hasReturns
                      ? "По выдаче есть возврат — исправление через сторно возврата"
                      : "Несколько строк в одной выдаче — исправление в карточке выдачи"
              }
            />
            {row && !isReturn && canEdit && row.issueItemId && row.returnable > 0 ? (
              <ReturnRowButton
                issueId={row.id}
                issueItemId={row.issueItemId}
                materialName={row.materialName}
                unit={row.unitCode}
                returnable={row.returnable}
              />
            ) : null}
          </div>
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
        exportHref={href("/warehouse/export?sheet=outgoing")}
        pending={pending.length}
        onSavePending={() => void saveAll()}
      />
      <datalist id="outgoing-materials">
        {materials.map((m) => (
          <option
            key={m.id}
            value={m.name}
            label={`на складе ${formatQuantity(stock.get(m.id) ?? 0, m.unit)}`}
          />
        ))}
      </datalist>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        {/* Минимальная ширина: на узком экране таблица прокручивается, а не сжимает колонки. */}
        <table className={cn(sheetTable, "min-w-[80rem]")} onKeyDown={sheetNavigate}>
          <thead className="sticky top-0 z-[2] bg-muted">
            <tr>
              <th className={cn(sheetHead, "sticky left-0 z-[3] bg-muted")}>Дата</th>
              <th className={sheetHead}>Наименование</th>
              <th className={sheetHead}>Блок</th>
              <th className={sheetHead}>Этаж</th>
              <th className={sheetHead}>Этап</th>
              <th className={cn(sheetHead, "text-right")}>Кол-во</th>
              <th className={cn(sheetHead, "text-right")}>Норматив</th>
              <th className={cn(sheetHead, "text-right")}>Остаток норм.</th>
              <th className={sheetHead}>Ответственный</th>
              <th className={cn(sheetHead, "sticky right-0 z-[3] bg-muted")} />
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
          Строка проводится, когда вы уходите с неё — остаток уменьшается сразу, в минус выдать
          нельзя. Норматив задаёт управляющий; перерасход подсвечен красным. Исправить строку можно
          в течение 7 дней — система сторнирует старую выдачу и проведёт новую. Бригада вернула
          материал — кнопка ↩ в строке выдачи: появится зелёная строка с минусом, итог — чистый
          расход.
        </p>
      ) : null}
    </div>
  );
}
