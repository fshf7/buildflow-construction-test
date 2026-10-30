"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Children, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { PAGE_SIZE, pageCount, pageWindow, resolvePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export type PaginationOptions = {
  /** Параметр адреса; на странице с несколькими списками — у каждого свой. */
  param?: string;
  /** Без номера в адресе — последняя страница (таблицы склада: новые строки внизу). */
  last?: boolean;
  /** id прокручиваемого контейнера списка: при смене страницы он прокручивается в начало. */
  scrollTarget?: string;
};

/**
 * Страница списка (Д-108): по 30 строк, номер — в адресе (?page=): «назад» из карточки
 * возвращает на ту же страницу. Переключение без запроса к серверу (history API синхронизирован
 * с useSearchParams). Страница по умолчанию в адрес не пишется.
 */
export function usePagination(
  total: number,
  { param = "page", last = false, scrollTarget }: PaginationOptions = {},
) {
  const params = useSearchParams();
  const pathname = usePathname();
  const pages = pageCount(total);
  const page = resolvePage(params.get(param), pages, last);
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);

  function setPage(next: number) {
    const query = new URLSearchParams(window.location.search);
    if (next === (last ? pages : 1)) query.delete(param);
    else query.set(param, String(next));
    const q = query.toString();
    window.history.replaceState(null, "", q ? `${pathname}?${q}` : pathname);
    const box = scrollTarget ? document.getElementById(scrollTarget) : null;
    if (box) box.scrollTop = 0;
    else window.scrollTo({ top: 0 });
  }

  /** Сбросить на страницу по умолчанию (после смены фильтра внутри компонента). */
  function resetPage() {
    if (!params.has(param)) return;
    const query = new URLSearchParams(window.location.search);
    query.delete(param);
    const q = query.toString();
    window.history.replaceState(null, "", q ? `${pathname}?${q}` : pathname);
  }

  return {
    page,
    pages,
    total,
    start,
    end,
    setPage,
    resetPage,
    /** Последняя страница — на ней новые строки таблиц склада. */
    isLast: page === pages,
    slice: <T,>(rows: T[]) => rows.slice(start, end),
  };
}

export type Paging = ReturnType<typeof usePagination>;

/** «31–60 из 125» и кнопки страниц. Одна страница — ничего не показывает. */
export function Pager({ paging, className }: { paging: Paging; className?: string }) {
  const { page, pages, total, start, end, setPage } = paging;
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Страницы"
      className={cn("flex flex-wrap items-center justify-between gap-2 print:hidden", className)}
    >
      <span className="text-sm text-muted-foreground tabular-nums">
        {start + 1}–{end} из {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Предыдущая страница"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "ghost"}
              size="icon"
              className="tabular-nums"
              aria-label={`Страница ${p}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Следующая страница"
          disabled={page === pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/**
 * Для серверных списков: строки (уже отрисованные на сервере) — детьми, на экране — текущая
 * страница. Кнопки — отдельно `<PagedPager total=… />` (например, под таблицей, вне <tbody>);
 * оба читают одну страницу из адреса.
 */
export function PageSlice({ children, ...options }: PaginationOptions & { children: ReactNode }) {
  const rows = Children.toArray(children);
  const paging = usePagination(rows.length, options);
  return <>{paging.slice(rows)}</>;
}

export function PagedPager({
  total,
  className,
  ...options
}: PaginationOptions & { total: number; className?: string }) {
  const paging = usePagination(total, options);
  return <Pager paging={paging} className={className} />;
}
