/**
 * Пагинация списков и таблиц (Д-108): по 30 строк, страница — в адресе (?page=). Чистая логика —
 * покрыта Vitest; компоненты — `components/pagination.tsx`.
 */
export const PAGE_SIZE = 30;

/**
 * Номер страницы из адреса. Нет или неверный — первая страница (или последняя: в таблицах склада
 * новые строки внизу). Больше числа страниц — последняя.
 */
export function resolvePage(raw: string | null, pages: number, last = false): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return last ? pages : 1;
  return Math.min(n, pages);
}

export const pageCount = (total: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size));

/** Номера страниц для кнопок: первая, последняя, соседние с текущей; пропуски — null («…»). */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  // Пропуск в одну страницу показываем самой страницей, а не «…».
  if (keep.has(3) && pages >= 3) keep.add(2);
  if (keep.has(pages - 2) && pages >= 3) keep.add(pages - 1);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/** Диапазон строк страницы для запроса к БД (`.range(from, to)`, включительно). */
export function pageRange(page: number, size = PAGE_SIZE): { from: number; to: number } {
  return { from: (page - 1) * size, to: page * size - 1 };
}
