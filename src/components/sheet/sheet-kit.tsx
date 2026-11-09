"use client";

import { Check, CircleAlert, Loader2, Lock } from "lucide-react";

/**
 * Общие части таблиц «как Excel» (Д-99, Д-100): стили ячеек в палитре сайта, навигация клавишами,
 * значок состояния строки. Таблицы: накладная, приход, расход, услуги, нормативы.
 */

/** Поле ввода в ячейке: без рамки, фокус — рамкой основного цвета, ошибка — красным фоном. */
export const sheetInput =
  "h-9 w-full min-w-0 border-0 bg-transparent px-2 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-primary focus:ring-inset aria-invalid:bg-destructive/10 disabled:opacity-60";

export const sheetTable = "w-full border-collapse text-sm";
export const sheetHead =
  "border-b border-l px-2 py-2 text-left font-medium whitespace-nowrap first:border-l-0";
export const sheetCell = "border-l p-0 first:border-l-0";
export const sheetText = "block px-2 py-2 text-sm";

/**
 * Enter и стрелки — как в Excel: в ту же колонку соседней строки. Ячейки помечаются data-col,
 * в выпадающих списках стрелки оставлены списку.
 */
export function sheetNavigate(e: React.KeyboardEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  const isSelect = target.tagName === "SELECT";
  const down = e.key === "Enter" || (!isSelect && e.key === "ArrowDown");
  const up = !isSelect && e.key === "ArrowUp";
  if (!down && !up) return;
  const td = target.closest<HTMLElement>("[data-col]");
  const tr = target.closest("tr");
  if (!td || !tr) return;
  // Строка ввода сверху (data-entry-top, Д-114): Enter в новой строке — к пустой строке вверху,
  // а не вниз, к уже сохранённым.
  const table = tr.closest<HTMLElement>("table");
  const entryTop =
    e.key === "Enter" && table?.dataset.entryTop !== undefined && tr.dataset.entry !== undefined;
  const sibling = (
    entryTop
      ? tr.parentElement?.firstElementChild
      : down
        ? tr.nextElementSibling
        : tr.previousElementSibling
  ) as HTMLElement | null;
  const next = sibling?.querySelector<HTMLElement>(
    `[data-col="${td.dataset.col}"] input, [data-col="${td.dataset.col}"] select`,
  );
  e.preventDefault();
  next?.focus();
}

/** Многострочная вставка из Excel / Google Таблиц (табы или переводы строк)? */
export function isTablePaste(text: string): boolean {
  return text.includes("\t") || text.trim().includes("\n");
}

export type RowState = { state: "saving" | "saved" | "error"; message?: string; fields?: string[] };

export function RowStatus({
  state,
  locked,
  lockedHint,
  warning,
}: {
  state?: RowState;
  locked?: boolean;
  lockedHint?: string;
  warning?: string;
}) {
  if (state?.state === "saving")
    return (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Сохраняется" />
    );
  if (state?.state === "error")
    return (
      <CircleAlert className="size-4 text-destructive" role="img" aria-label={state.message}>
        <title>{state.message}</title>
      </CircleAlert>
    );
  if (warning)
    return (
      <CircleAlert className="size-4 text-amber-600" role="img" aria-label={warning}>
        <title>{warning}</title>
      </CircleAlert>
    );
  if (state?.state === "saved")
    return <Check className="size-4 text-emerald-600" aria-label="Сохранено" />;
  if (locked)
    return (
      <Lock className="size-3.5 text-muted-foreground" role="img" aria-label="Только чтение">
        <title>{lockedHint ?? "Только чтение"}</title>
      </Lock>
    );
  return null;
}
