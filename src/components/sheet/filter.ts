/**
 * Фильтр таблиц склада (Д-100): период по дате строки и поиск по тексту. Без "use client" —
 * та же функция в выгрузке Excel, поэтому на экране и в файле одни и те же строки.
 */
export type SheetFilter = { from?: string; to?: string; text?: string };

export function filterSheetRows<R>(
  rows: R[],
  f: SheetFilter,
  dateOf: (r: R) => string,
  searchOf: (r: R) => string,
): R[] {
  const text = f.text?.toLocaleLowerCase("ru").trim() ?? "";
  return rows.filter((r) => {
    const d = dateOf(r);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    return !text || searchOf(r).toLocaleLowerCase("ru").includes(text);
  });
}

/** Дата N дней назад (YYYY-MM-DD) — окно исправления строк склада (7 дней). */
export function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
