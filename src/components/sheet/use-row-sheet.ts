"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { RowState } from "./sheet-kit";

/** Строка с сервера: ключ строки таблицы, id документа, значения полей, можно ли править. */
export type SheetRow<D> = { key: string; id: string; draft: D; editable: boolean };

type Validation<P> = { ok: true; data: P } | { ok: false; fields: string[]; message: string };
type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Таблица с сохранением по строкам (Д-100): правки существующих строк и новые строки внизу (всегда
 * одна пустая); строка сохраняется, когда фокус уходит с неё и в ней что-то изменилось. Ошибки —
 * по полям (подсветка ячеек). Вставка из Excel добавляет строки, их сохраняют кнопкой.
 */
export function useRowSheet<D extends Record<string, unknown>, P>({
  emptyDraft,
  isBlank,
  same,
  validate,
  save,
}: {
  emptyDraft: () => D & { id: string };
  isBlank: (d: D) => boolean;
  same: (a: D, b: D) => boolean;
  validate: (d: D) => Validation<P>;
  save: (data: P, id: string) => Promise<SaveResult>;
}) {
  const [edits, setEdits] = useState<Record<string, D>>({});
  const [fresh, setFresh] = useState<(D & { id: string })[]>(() => [emptyDraft()]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  // Сохранённые новые строки: дальше их показывает сервер (строкой документа). Без этого после
  // исправления строки (корректировка = новый документ) черновик всплывал снова как несохранённый.
  const [persisted, setPersisted] = useState<Set<string>>(() => new Set());

  function draftOf(row: SheetRow<D>): D {
    return edits[row.key] ?? row.draft;
  }

  function clearState(key: string) {
    setStates((s) => {
      if (!s[key] || s[key].state === "saving") return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
  }

  function changeRow(row: SheetRow<D>, patch: Partial<D>) {
    clearState(row.key);
    setEdits((e) => ({ ...e, [row.key]: { ...(e[row.key] ?? row.draft), ...patch } }));
  }

  function changeNew(id: string, patch: Partial<D>) {
    clearState(id);
    setFresh((list) => {
      const next = list.map((d) => (d.id === id ? { ...d, ...patch } : d));
      const last = next[next.length - 1];
      return last && !isBlank(last) ? [...next, emptyDraft()] : next;
    });
  }

  async function run(key: string, id: string, draft: D, isNew = false) {
    const v = validate(draft);
    if (!v.ok) {
      setStates((s) => ({ ...s, [key]: { state: "error", message: v.message, fields: v.fields } }));
      // Причина — сообщением на экране: подсказка у значка видна только при наведении мыши.
      toast.error(`Строка не сохранена. ${v.message}`, { id: `row-${key}` });
      return false;
    }
    setStates((s) => ({ ...s, [key]: { state: "saving" } }));
    const r = await save(v.data, id);
    if (r.ok && isNew) setPersisted((p) => new Set(p).add(id));
    if (!r.ok) toast.error(`Строка не сохранена: ${r.error}`, { id: `row-${key}` });
    setStates((s) => ({
      ...s,
      [key]: r.ok ? { state: "saved" } : { state: "error", message: r.error },
    }));
    return r.ok;
  }

  /** Фокус ушёл со строки: сохранить, если что-то изменилось. */
  function leaveRow(row: SheetRow<D>) {
    const d = edits[row.key];
    if (!d || !row.editable || states[row.key]?.state === "saving" || same(d, row.draft)) return;
    void run(row.key, row.id, d);
  }

  function leaveNew(id: string) {
    const d = fresh.find((x) => x.id === id);
    if (!d || isBlank(d) || states[id]?.state === "saving") return;
    void run(id, id, d, true);
  }

  /** Вставка строк: заменяет пустые новые строки, в конце — снова пустая. id — свой или новый. */
  function addPasted(drafts: (D & { id?: string })[]) {
    setFresh((list) => [
      ...list.filter((d) => !isBlank(d)),
      ...drafts.map((d) => ({ ...d, id: d.id ?? emptyDraft().id })),
      emptyDraft(),
    ]);
  }

  return {
    states,
    fresh: fresh.filter((d) => !persisted.has(d.id)),
    draftOf,
    changeRow,
    changeNew,
    leaveRow,
    leaveNew,
    addPasted,
    /** Новые строки, ещё не сохранённые (для кнопки «Сохранить строки»). */
    pendingNew: (savedIds: Set<string>) =>
      fresh.filter(
        (d) =>
          !isBlank(d) &&
          !persisted.has(d.id) &&
          !savedIds.has(d.id) &&
          states[d.id]?.state !== "saving",
      ),
    saveNew: (d: D & { id: string }) => run(d.id, d.id, d, true),
  };
}
