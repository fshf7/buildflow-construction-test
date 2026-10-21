"use client";

import { Download } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

import type { SheetFilter } from "./filter";

const input = "h-8 rounded-md border bg-background px-2 text-sm";

/** Панель над таблицей склада: период, поиск, число строк, Excel, «Сохранить строки». */
export function SheetToolbar({
  filter,
  onFilter,
  count,
  exportHref,
  pending,
  onSavePending,
  extra,
}: {
  filter: SheetFilter;
  onFilter: (f: SheetFilter) => void;
  count: number;
  exportHref?: string;
  pending?: number;
  onSavePending?: () => void;
  extra?: React.ReactNode;
}) {
  const query = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        aria-label="С даты"
        className={input}
        value={filter.from ?? ""}
        onChange={(e) => onFilter({ ...filter, from: e.target.value || undefined })}
      />
      <span className="text-muted-foreground">—</span>
      <input
        type="date"
        aria-label="По дату"
        className={input}
        value={filter.to ?? ""}
        onChange={(e) => onFilter({ ...filter, to: e.target.value || undefined })}
      />
      <input
        aria-label="Поиск"
        placeholder="Поиск"
        className={`${input} w-48`}
        value={filter.text ?? ""}
        onChange={(e) => onFilter({ ...filter, text: e.target.value || undefined })}
      />
      {filter.from || filter.to || filter.text ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onFilter({})}>
          Сбросить
        </Button>
      ) : null}
      {exportHref ? (
        <a
          href={`${exportHref}${query ? `${exportHref.includes("?") ? "&" : "?"}${query}` : ""}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          download
        >
          <Download />
          Excel
        </a>
      ) : null}
      {pending && onSavePending ? (
        <Button type="button" size="sm" onClick={onSavePending}>
          Сохранить строки ({pending})
        </Button>
      ) : null}
      {extra}
      <span className="ml-auto text-sm text-muted-foreground">Строк: {count}</span>
    </div>
  );
}
