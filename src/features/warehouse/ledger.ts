/**
 * Карточка материала как книга движений (Д-104): одна строка на документ, остаток после строки.
 * Исправление — это новый документ и сторно старого (проведённое не удаляется), но в обычном
 * виде пара «старый документ + его сторно» скрыта: видна одна строка «исправлено, было N».
 * Полный журнал — по переключателю. Без "server-only": логика покрыта Vitest.
 */

export type LedgerMovement = {
  id: string;
  quantity: number;
  type: string;
  occurredOn: string;
  docType: string;
  docId: string;
  /** У движения-сторно — какое движение оно отменяет. */
  reversalOf: string | null;
};

export type LedgerDoc = {
  number: string | null;
  /** Бригада, место — вторая строка подписи. */
  detail?: string;
  /** Документ, который этот исправляет (корректировка приёмки, новая выдача взамен). */
  parentId?: string | null;
  href?: string;
  /** Для фильтров: бригада (выдача, возврат) и блок (выдача; возврат — блок своей выдачи). */
  crewId?: string | null;
  blockId?: string | null;
};

export type LedgerEntry = {
  id: string;
  date: string;
  title: string;
  detail: string;
  quantity: number;
  balanceAfter: number;
  /** Было до исправления (количество исходного документа). */
  was: number | null;
  /** Полный журнал: «исправлена» / «отменена» / «отмена документа». */
  status: "corrected" | "cancelled" | "reversal" | null;
  href?: string;
  docType: string;
  number: string | null;
  crewId: string | null;
  blockId: string | null;
};

const DOC_LABELS: Record<string, string> = {
  GOODS_RECEIPT: "Приёмка",
  MATERIAL_ISSUE: "Выдача",
  MATERIAL_RETURN: "Возврат",
  OPENING_BALANCE: "Начальный остаток",
};

/**
 * @param movements движения материала, от новых к старым
 * @param balance текущий остаток — от него назад считается «остаток после»
 */
export function buildLedger(
  movements: LedgerMovement[],
  docs: Map<string, LedgerDoc>,
  balance: number,
  showAll: boolean,
): { entries: LedgerEntry[]; hidden: number } {
  const reversed = new Set(movements.flatMap((m) => (m.reversalOf ? [m.reversalOf] : [])));
  const replaced = new Set([...docs.values()].flatMap((d) => (d.parentId ? [d.parentId] : [])));
  const byId = new Map(movements.map((m) => [m.id, m]));
  const isPair = (m: LedgerMovement) => m.reversalOf !== null || reversed.has(m.id);
  const shown = showAll ? movements : movements.filter((m) => !isPair(m));

  const title = (m: LedgerMovement) =>
    `${DOC_LABELS[m.docType] ?? m.type} ${docs.get(m.docId)?.number ?? ""}`.trim();

  let running = balance;
  const entries = shown.map((m): LedgerEntry => {
    const doc = docs.get(m.docId);
    const parent = doc?.parentId
      ? movements.find((x) => x.docId === doc.parentId && x.reversalOf === null)
      : undefined;
    const target = m.reversalOf ? byId.get(m.reversalOf) : undefined;
    const entry: LedgerEntry = {
      id: m.id,
      date: m.occurredOn,
      title: target ? `Отмена: ${title(target)}` : title(m),
      detail: doc?.detail ?? "",
      quantity: m.quantity,
      balanceAfter: running,
      was: parent ? Math.abs(parent.quantity) : null,
      status: m.reversalOf
        ? "reversal"
        : reversed.has(m.id)
          ? replaced.has(m.docId)
            ? "corrected"
            : "cancelled"
          : null,
      href: doc?.href,
      docType: m.docType,
      number: doc?.number ?? null,
      crewId: doc?.crewId ?? null,
      blockId: doc?.blockId ?? null,
    };
    running -= m.quantity;
    return entry;
  });
  return { entries, hidden: movements.length - movements.filter((m) => !isPair(m)).length };
}

// ---------------------------------------------------------------------------------------
// Фильтры карточки (Д-105): период, операция, бригада, блок, номер документа
// ---------------------------------------------------------------------------------------
export type LedgerFilter = {
  from?: string;
  to?: string;
  /** GOODS_RECEIPT | MATERIAL_ISSUE | MATERIAL_RETURN | OPENING_BALANCE */
  kind?: string;
  crew?: string;
  block?: string;
  q?: string;
};

export const LEDGER_KINDS = [
  { value: "GOODS_RECEIPT", label: "Приёмка" },
  { value: "MATERIAL_ISSUE", label: "Выдача" },
  { value: "MATERIAL_RETURN", label: "Возврат" },
  { value: "OPENING_BALANCE", label: "Начальный остаток" },
];

export function filterLedger(entries: LedgerEntry[], f: LedgerFilter): LedgerEntry[] {
  const q = f.q?.trim().toLocaleLowerCase("ru") ?? "";
  return entries.filter(
    (e) =>
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to) &&
      (!f.kind || e.docType === f.kind) &&
      (!f.crew || e.crewId === f.crew) &&
      (!f.block || e.blockId === f.block) &&
      (!q || (e.number ?? "").toLocaleLowerCase("ru").includes(q)),
  );
}

export type LedgerTotals = {
  /** Приёмки и начальный остаток (с учётом исправлений). */
  received: number;
  issued: number;
  returned: number;
  /** Остаток материала на начало и конец периода (только если период задан). */
  start: number | null;
  end: number | null;
};

/**
 * Итоги по отфильтрованным строкам. Остаток на начало/конец периода — остаток материала на дату
 * (не зависит от бригады или вида операции): текущий остаток минус всё, что датировано позже.
 * Так верно и для строк, внесённых задним числом.
 */
export function ledgerTotals(
  filtered: LedgerEntry[],
  all: LedgerEntry[],
  balance: number,
  f: Pick<LedgerFilter, "from" | "to">,
): LedgerTotals {
  const round = (v: number) => Math.round(v * 10000) / 10000 || 0; // без «−0»
  const sum = (list: LedgerEntry[]) => list.reduce((s, e) => s + e.quantity, 0);
  const ofType = (types: string[]) => sum(filtered.filter((e) => types.includes(e.docType)));
  const period = Boolean(f.from || f.to);
  const at = (pred: (e: LedgerEntry) => boolean) => round(balance - sum(all.filter(pred)));
  return {
    received: round(ofType(["GOODS_RECEIPT", "OPENING_BALANCE"])),
    issued: round(-ofType(["MATERIAL_ISSUE"])),
    returned: round(ofType(["MATERIAL_RETURN"])),
    start: !period ? null : f.from ? at((e) => e.date >= f.from!) : 0,
    end: !period ? null : f.to ? at((e) => e.date > f.to!) : round(balance),
  };
}
