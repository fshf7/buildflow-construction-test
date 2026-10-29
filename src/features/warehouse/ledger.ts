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
    };
    running -= m.quantity;
    return entry;
  });
  return { entries, hidden: movements.length - movements.filter((m) => !isPair(m)).length };
}
