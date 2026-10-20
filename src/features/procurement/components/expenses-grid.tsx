"use client";

import { Check, CircleAlert, Download, Filter, Loader2, Lock, MoveUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useObject, useObjectHref } from "@/components/object-context";
import { ObjectLink } from "@/components/object-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { colorPill } from "@/features/catalog/expense-colors";
import type { MaterialOption, Option } from "@/features/shared/lookups";
import { toNumber } from "@/lib/decimal";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveExpenseRow } from "../actions";
import {
  currencyLabel,
  EXPENSE_CURRENCIES,
  filterExpenseRows,
  parsePastedRows,
  totalsByCurrency,
  type ExpenseFilters,
  type ExpenseRow,
} from "../expenses";
import { expenseRowFields } from "../schemas";

export type ExpenseCategoryOption = {
  id: string;
  name: string;
  color: string;
  viaWarehouse: boolean;
  isActive: boolean;
};

/** Значения строки в полях ввода (строки — как в Excel: «3,50»). */
type Draft = {
  id: string;
  docDate: string;
  description: string;
  materialId: string;
  categoryId: string;
  quantity: string;
  unitId: string;
  price: string;
  currency: string;
  supplierId: string;
  docNumber: string;
  /** Что из вставки не нашлось в справочниках. */
  unmatched?: string[];
};

type RowState = { state: "saving" | "saved" | "error"; message?: string; fields?: string[] };

/** Подписи полей для сообщения об ошибке строки. */
const FIELD_LABELS: Record<string, string> = {
  docDate: "Дата",
  description: "Наименование",
  categoryId: "Категория",
  quantity: "Кол-во",
  unitId: "Ед. изм.",
  price: "Цена",
  currency: "Валюта",
  supplierId: "Поставщик",
  docNumber: "№ накладной",
};

const num = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

function fromRow(r: ExpenseRow): Draft {
  return {
    id: r.invoiceId,
    docDate: r.docDate,
    description: r.description,
    materialId: r.materialId ?? "",
    categoryId: r.categoryId ?? "",
    quantity: num(r.quantity),
    unitId: r.unitId,
    price: num(r.price),
    currency: r.currency,
    supplierId: r.supplierId,
    docNumber: r.docNumber ?? "",
  };
}

const FIELDS = [
  "docDate",
  "description",
  "categoryId",
  "quantity",
  "unitId",
  "price",
  "currency",
  "supplierId",
  "docNumber",
] as const;

const sameValues = (a: Draft, b: Draft) => FIELDS.every((f) => a[f] === b[f]);
const isBlank = (d: Draft) =>
  !d.description.trim() && !d.quantity && !d.price && !d.supplierId && !d.categoryId;

const cellInput =
  "h-8 w-full min-w-0 rounded-none border-0 bg-transparent px-1.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-primary focus:ring-inset aria-invalid:bg-destructive/10";

/**
 * Журнал затрат объекта как таблица Excel (Д-97): ввод прямо в ячейках, Tab/Enter/стрелки,
 * вставка строк из Excel/Google Таблиц, фильтры в заголовке, итоги, экспорт. Строка сохраняется,
 * когда фокус уходит со строки: сразу долг поставщику; оплаченные строки — только чтение.
 */
export function ExpensesGrid({
  rows,
  categories,
  suppliers,
  units,
  materials,
  canEdit,
  withPrices,
  withDebts,
  today,
}: {
  rows: ExpenseRow[];
  categories: ExpenseCategoryOption[];
  suppliers: Option[];
  units: Option[];
  materials: MaterialOption[];
  canEdit: boolean;
  withPrices: boolean;
  withDebts: boolean;
  today: string;
}) {
  const object = useObject();
  const href = useObjectHref();
  const scroller = useRef<HTMLDivElement>(null);
  const emptyDraft = (): Draft => ({
    id: crypto.randomUUID(),
    docDate: today,
    description: "",
    materialId: "",
    categoryId: "",
    quantity: "",
    unitId: "",
    price: "",
    currency: "TJS",
    supplierId: "",
    docNumber: "",
  });

  // Правки существующих строк (по ключу строки) и новые строки (ещё не в данных сервера).
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [fresh, setFresh] = useState<Draft[]>(() => [emptyDraft()]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const serverIds = useMemo(() => new Set(rows.map((r) => r.invoiceId)), [rows]);
  // Сохранённая новая строка пришла с сервера — показываем её как обычную.
  const pending = fresh.filter((d) => !serverIds.has(d.id));
  const visible = useMemo(() => filterExpenseRows(rows, filters), [rows, filters]);
  const totals = totalsByCurrency(visible);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const materialByName = new Map(materials.map((m) => [m.name.toLocaleLowerCase("ru"), m]));
  const filtered = Object.values(filters).some(Boolean);

  // Как в Excel: открываем внизу, у строки ввода.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, []);

  function draftOf(key: string, row?: ExpenseRow): Draft {
    return edits[key] ?? fresh.find((d) => d.id === key) ?? fromRow(row!);
  }

  function change(key: string, isNew: boolean, patch: Partial<Draft>, row?: ExpenseRow) {
    // Наименование совпало с материалом справочника — подставляем материал и его единицу.
    if (patch.description !== undefined) {
      const m = materialByName.get(patch.description.trim().toLocaleLowerCase("ru"));
      patch.materialId = m?.id ?? "";
      if (m) patch.unitId = m.unitId;
    }
    setStates((s) => {
      if (!s[key] || s[key].state === "saving") return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
    if (isNew) {
      setFresh((list) => {
        const next = list.map((d) => (d.id === key ? { ...d, ...patch, unmatched: [] } : d));
        // Всегда одна пустая строка внизу.
        const last = next[next.length - 1];
        return last && !isBlank(last) ? [...next, emptyDraft()] : next;
      });
    } else {
      setEdits((e) => ({ ...e, [key]: { ...draftOf(key, row), ...patch } }));
    }
  }

  async function save(key: string, draft: Draft) {
    const parsed = expenseRowFields.safeParse(draft);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => String(i.path[0]));
      const message = [...new Set(fields)].map((f) => FIELD_LABELS[f] ?? f).join(", ");
      setStates((s) => ({
        ...s,
        [key]: { state: "error", message: `Заполните: ${message}`, fields },
      }));
      return;
    }
    setStates((s) => ({ ...s, [key]: { state: "saving" } }));
    const result = await saveExpenseRow({
      ...parsed.data,
      id: draft.id,
      key: crypto.randomUUID(),
      projectId: object.id,
    });
    setStates((s) => ({
      ...s,
      [key]: result.ok ? { state: "saved" } : { state: "error", message: result.error },
    }));
  }

  /** Фокус ушёл со строки: сохранить, если что-то изменилось. */
  function leaveRow(key: string, isNew: boolean, row?: ExpenseRow) {
    const draft = isNew ? fresh.find((d) => d.id === key) : edits[key];
    if (!draft || states[key]?.state === "saving") return;
    if (isNew ? isBlank(draft) : row && sameValues(draft, fromRow(row))) return;
    void save(key, draft);
  }

  /** Вставка нескольких строк из Excel / Google Таблиц в строку ввода. */
  function paste(e: React.ClipboardEvent, key: string) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.trim().includes("\n")) return;
    e.preventDefault();
    const parsed = parsePastedRows(text, {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      units: units.map((u) => ({ id: u.id, name: u.label.split(" — ")[0]! })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.label })),
    });
    if (parsed.length === 0) return;
    const drafts = parsed.map((p) => {
      const material = materialByName.get(p.description.trim().toLocaleLowerCase("ru"));
      return {
        ...p,
        id: crypto.randomUUID(),
        docDate: p.docDate || today,
        currency: p.currency || "TJS",
        materialId: material?.id ?? "",
        unitId: p.unitId || material?.unitId || "",
      } satisfies Draft;
    });
    setFresh((list) => [
      ...list.filter((d) => d.id !== key && !isBlank(d)),
      ...drafts,
      emptyDraft(),
    ]);
  }

  const unsaved = pending.filter((d) => !isBlank(d) && states[d.id]?.state !== "saving");
  async function saveAllPending() {
    for (const d of unsaved) await save(d.id, d);
  }

  /** Enter и стрелки — как в Excel: в ту же колонку соседней строки. */
  function navigate(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    const isSelect = target.tagName === "SELECT";
    const down = e.key === "Enter" || (!isSelect && e.key === "ArrowDown");
    const up = !isSelect && e.key === "ArrowUp";
    if (!down && !up) return;
    const cell = target.closest<HTMLElement>("[data-col]");
    const tr = target.closest("tr");
    if (!cell || !tr) return;
    const sibling = (
      down ? tr.nextElementSibling : tr.previousElementSibling
    ) as HTMLElement | null;
    const next = sibling?.querySelector<HTMLElement>(
      `[data-col="${cell.dataset.col}"] input, [data-col="${cell.dataset.col}"] select`,
    );
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const exportQuery = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const setFilter = (patch: Partial<ExpenseFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filterInput = "h-7 w-full rounded border bg-background px-1.5 text-xs font-normal";
  const activeCategories = categories.filter((c) => c.isActive);

  function renderRow(key: string, isNew: boolean, row?: ExpenseRow) {
    const d = draftOf(key, row);
    const st = states[key];
    const locked = !canEdit || (!isNew && !row!.editable);
    const cancelled = row?.status === "CANCELLED";
    const category = categoryById.get(d.categoryId);
    const amount = d.quantity && d.price ? toNumber(d.quantity) * toNumber(d.price) : null;
    const set = (patch: Partial<Draft>) => change(key, isNew, patch, row);
    const invalid = (field: keyof Draft) => Boolean(st?.fields?.includes(field));
    const cell = (col: string, extra?: string) =>
      cn("border-r border-b p-0 align-middle", extra, cancelled && "line-through opacity-50");

    return (
      <tr
        key={key}
        onBlur={(e) => {
          if (!locked && !e.currentTarget.contains(e.relatedTarget as Node | null))
            leaveRow(key, isNew, row);
        }}
        onKeyDown={navigate}
        className={cn(
          "group",
          isNew && "bg-primary/[0.03]",
          (d.unmatched?.length ?? 0) > 0 && "bg-amber-50 dark:bg-amber-950/40",
        )}
      >
        <td data-col="date" className={cell("date", "sticky left-0 z-[1] w-32 bg-card")}>
          {locked ? (
            <span className="block px-1.5 text-sm">{formatDate(d.docDate)}</span>
          ) : (
            <input
              type="date"
              aria-label="Дата"
              aria-invalid={invalid("docDate")}
              className={cellInput}
              value={d.docDate}
              onChange={(e) => set({ docDate: e.target.value })}
            />
          )}
        </td>
        <td data-col="description" className={cell("description", "min-w-56")}>
          {locked ? (
            <span className="block px-1.5 text-sm">{d.description}</span>
          ) : (
            <input
              aria-label="Наименование"
              aria-invalid={invalid("description")}
              list="expense-materials"
              className={cellInput}
              value={d.description}
              placeholder={isNew && isBlank(d) ? "Новая строка — или вставьте из Excel" : ""}
              onPaste={isNew ? (e) => paste(e, key) : undefined}
              onChange={(e) => set({ description: e.target.value })}
            />
          )}
        </td>
        <td data-col="category" className={cell("category", "w-44 px-1")}>
          {locked ? (
            category ? (
              <span className={cn("rounded-full px-2 py-0.5 text-xs", colorPill(category.color))}>
                {category.name}
              </span>
            ) : (
              "—"
            )
          ) : (
            <select
              aria-label="Категория"
              aria-invalid={invalid("categoryId")}
              className={cn(
                "h-6 w-full rounded-full border-0 px-2 text-xs outline-none focus:ring-2 focus:ring-primary aria-invalid:ring-2 aria-invalid:ring-destructive",
                category ? colorPill(category.color) : "bg-muted text-muted-foreground",
              )}
              value={d.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              <option value="">Категория</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="quantity" className={cell("quantity", "w-24")}>
          {locked ? (
            <span className="block px-1.5 text-right text-sm tabular-nums">
              {formatQuantity(toNumber(d.quantity || "0"))}
            </span>
          ) : (
            <input
              aria-label="Количество"
              aria-invalid={invalid("quantity")}
              inputMode="decimal"
              className={cn(cellInput, "text-right tabular-nums")}
              value={d.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          )}
        </td>
        <td data-col="unit" className={cell("unit", "w-24")}>
          {locked ? (
            <span className="block px-1.5 text-sm">{row?.unitCode}</span>
          ) : (
            <select
              aria-label="Единица"
              aria-invalid={invalid("unitId")}
              className={cellInput}
              value={d.unitId}
              disabled={Boolean(d.materialId)}
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
        {withPrices ? (
          <>
            <td data-col="price" className={cell("price", "w-28")}>
              {locked ? (
                <span className="block px-1.5 text-right text-sm tabular-nums">
                  {formatAmount(toNumber(d.price || "0"))}
                </span>
              ) : (
                <input
                  aria-label="Цена за единицу"
                  aria-invalid={invalid("price")}
                  inputMode="decimal"
                  className={cn(cellInput, "text-right tabular-nums")}
                  value={d.price}
                  onChange={(e) => set({ price: e.target.value })}
                />
              )}
            </td>
            <td data-col="currency" className={cell("currency", "w-20")}>
              {locked ? (
                <span className="block px-1.5 text-sm">{currencyLabel(d.currency)}</span>
              ) : (
                <select
                  aria-label="Валюта"
                  className={cellInput}
                  value={d.currency}
                  onChange={(e) => set({ currency: e.target.value })}
                >
                  {EXPENSE_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </td>
            <td
              className={cell("amount", "w-32 px-1.5 text-right text-sm font-medium tabular-nums")}
            >
              {amount === null || !Number.isFinite(amount)
                ? ""
                : formatAmount(Math.round(amount * 100) / 100)}
            </td>
          </>
        ) : null}
        <td data-col="supplier" className={cell("supplier", "w-48")}>
          {locked ? (
            <span className="block px-1.5 text-sm">{row?.supplierName}</span>
          ) : (
            <select
              aria-label="Поставщик"
              aria-invalid={invalid("supplierId")}
              className={cellInput}
              value={d.supplierId}
              onChange={(e) => set({ supplierId: e.target.value })}
            >
              <option value="">Поставщик</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td data-col="docNumber" className={cell("docNumber", "w-28")}>
          {locked ? (
            <span className="block px-1.5 text-sm">{d.docNumber}</span>
          ) : (
            <input
              aria-label="№ накладной"
              className={cellInput}
              value={d.docNumber}
              onChange={(e) => set({ docNumber: e.target.value })}
            />
          )}
        </td>
        {withDebts ? (
          <td className={cell("debt", "w-28 px-1.5 text-xs")}>
            {row ? <DebtBadge row={row} /> : null}
          </td>
        ) : null}
        <td className="w-16 border-b px-1 text-center">
          <span className="inline-flex items-center gap-1">
            <RowStatus state={st} locked={locked && !isNew && canEdit} unmatched={d.unmatched} />
            {row ? (
              <ObjectLink
                path={`/procurement/invoices/${row.invoiceId}`}
                aria-label={`Открыть ${row.number ?? "запись"}`}
                title={`${row.number ?? "Запись"}: карточка, скан, отмена`}
                className="text-muted-foreground hover:text-foreground"
              >
                <MoveUpRight className="size-4" />
              </ObjectLink>
            ) : null}
          </span>
        </td>
      </tr>
    );
  }

  const colCount = 7 + (withPrices ? 3 : 0) + (withDebts ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={showFilters || filtered ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter />
          Фильтры{filtered ? " (включены)" : ""}
        </Button>
        {filtered ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilters({})}>
            Сбросить
          </Button>
        ) : null}
        <a
          href={`${href("/procurement/invoices/export")}${exportQuery ? `?${exportQuery}` : ""}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          download
        >
          <Download />
          Excel
        </a>
        {unsaved.length > 0 ? (
          <Button type="button" size="sm" onClick={() => void saveAllPending()}>
            Сохранить строки ({unsaved.length})
          </Button>
        ) : null}
        <span className="ml-auto text-sm text-muted-foreground">
          Строк: {visible.length}
          {totals.map((t) => (
            <b key={t.currency} className="ml-3 text-foreground tabular-nums">
              {formatAmount(t.total)} {currencyLabel(t.currency)}
            </b>
          ))}
        </span>
      </div>

      <datalist id="expense-materials">
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <div ref={scroller} className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[2] bg-emerald-800 text-white dark:bg-emerald-950">
            <tr>
              {[
                ["Дата", "sticky left-0 z-[3] bg-emerald-800 dark:bg-emerald-950"],
                ["Наименование", ""],
                ["Категория", ""],
                ["Кол-во", "text-right"],
                ["Ед. изм.", ""],
                ...(withPrices
                  ? [
                      ["Цена за ед.", "text-right"],
                      ["Валюта", ""],
                      ["Сумма", "text-right"],
                    ]
                  : []),
                ["Поставщик", ""],
                ["№ накл.", ""],
                ...(withDebts ? [["Оплата", ""]] : []),
                ["", ""],
              ].map(([label, extra], i) => (
                <th
                  key={i}
                  className={cn(
                    "border-r border-b border-white/20 px-1.5 py-2 text-left font-semibold whitespace-nowrap",
                    extra,
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
            {showFilters ? (
              <tr className="bg-muted text-foreground">
                <th className="sticky left-0 z-[3] border-r border-b bg-muted p-1">
                  <input
                    type="date"
                    aria-label="С даты"
                    className={filterInput}
                    value={filters.from ?? ""}
                    onChange={(e) => setFilter({ from: e.target.value || undefined })}
                  />
                  <input
                    type="date"
                    aria-label="По дату"
                    className={cn(filterInput, "mt-1")}
                    value={filters.to ?? ""}
                    onChange={(e) => setFilter({ to: e.target.value || undefined })}
                  />
                </th>
                <th className="border-r border-b p-1">
                  <input
                    aria-label="Поиск"
                    placeholder="Наименование, поставщик, №"
                    className={filterInput}
                    value={filters.text ?? ""}
                    onChange={(e) => setFilter({ text: e.target.value || undefined })}
                  />
                </th>
                <th className="border-r border-b p-1">
                  <select
                    aria-label="Фильтр по категории"
                    className={filterInput}
                    value={filters.categoryId ?? ""}
                    onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
                  >
                    <option value="">Все</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="border-r border-b" />
                <th className="border-r border-b" />
                {withPrices ? (
                  <>
                    <th className="border-r border-b" />
                    <th className="border-r border-b p-1">
                      <select
                        aria-label="Фильтр по валюте"
                        className={filterInput}
                        value={filters.currency ?? ""}
                        onChange={(e) => setFilter({ currency: e.target.value || undefined })}
                      >
                        <option value="">Все</option>
                        {EXPENSE_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="border-r border-b" />
                  </>
                ) : null}
                <th className="border-r border-b p-1">
                  <select
                    aria-label="Фильтр по поставщику"
                    className={filterInput}
                    value={filters.supplierId ?? ""}
                    onChange={(e) => setFilter({ supplierId: e.target.value || undefined })}
                  >
                    <option value="">Все</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="border-r border-b p-1">
                  <label className="flex items-center gap-1 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.showCancelled)}
                      onChange={(e) => setFilter({ showCancelled: e.target.checked || undefined })}
                    />
                    Отменённые
                  </label>
                </th>
                {withDebts ? (
                  <th className="border-r border-b p-1">
                    <select
                      aria-label="Фильтр по оплате"
                      className={filterInput}
                      value={filters.pay ?? ""}
                      onChange={(e) =>
                        setFilter({ pay: (e.target.value || undefined) as ExpenseFilters["pay"] })
                      }
                    >
                      <option value="">Все</option>
                      <option value="debt">Долг</option>
                      <option value="paid">Оплачено</option>
                    </select>
                  </th>
                ) : null}
                <th className="border-b" />
              </tr>
            ) : null}
          </thead>
          <tbody>
            {visible.map((r) => renderRow(r.key, false, r))}
            {visible.length === 0 && filtered ? (
              <tr>
                <td colSpan={colCount + 1} className="p-4 text-center text-muted-foreground">
                  По фильтру ничего не найдено
                </td>
              </tr>
            ) : null}
            {canEdit ? pending.map((d) => renderRow(d.id, true)) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <p className="text-xs text-muted-foreground">
          Строка сохраняется, когда вы уходите с неё (Tab, Enter, мышью): сразу появляется долг
          поставщику у кассира. Строки можно вставить из Excel или Google Таблиц (Ctrl+V в пустую
          строку). Оплаченные строки не меняются — откройте карточку{" "}
          <MoveUpRight className="inline size-3" />.
        </p>
      ) : null}
    </div>
  );
}

function DebtBadge({ row }: { row: ExpenseRow }) {
  if (row.status === "CANCELLED") return <span className="text-muted-foreground">Отменена</span>;
  if (row.debtStatus === "PAID")
    return <span className="text-emerald-700 dark:text-emerald-400">Оплачено</span>;
  if (row.debtStatus === "PARTIALLY_PAID")
    return <span className="text-amber-700 dark:text-amber-400">Частично</span>;
  if (row.debtStatus === "OPEN") return <span>Долг</span>;
  return <span className="text-muted-foreground">—</span>;
}

function RowStatus({
  state,
  locked,
  unmatched,
}: {
  state?: RowState;
  locked: boolean;
  unmatched?: string[];
}) {
  if (state?.state === "saving")
    return (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Сохраняется" />
    );
  if (state?.state === "error")
    return (
      <CircleAlert className="size-4 text-destructive" aria-label={state.message} role="img">
        <title>{state.message}</title>
      </CircleAlert>
    );
  if (unmatched && unmatched.length > 0)
    return (
      <CircleAlert
        className="size-4 text-amber-600"
        role="img"
        aria-label="Не найдено в справочниках"
      >
        <title>{`Не найдено в справочниках: ${unmatched.join(", ")}`}</title>
      </CircleAlert>
    );
  if (state?.state === "saved")
    return <Check className="size-4 text-emerald-600" aria-label="Сохранено" />;
  if (locked)
    return (
      <Lock className="size-3.5 text-muted-foreground" role="img" aria-label="Только чтение">
        <title>Оплачено или старая накладная — изменения в карточке</title>
      </Lock>
    );
  return null;
}
