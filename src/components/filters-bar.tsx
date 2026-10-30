"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };
export type FilterField =
  | {
      name: string;
      label: string;
      type: "select";
      options: FilterOption[];
      /** Текст пустого варианта; по умолчанию «Все» (в inline — «Подпись: все»). */
      allLabel?: string;
    }
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "search"; placeholder?: string };

const ALL = "";

/**
 * Фильтры списка в URL (?status=…&project=…): работают «назад», обновление и ссылки.
 * Фильтрация — на сервере (queries.ts), здесь только параметры.
 * inline — компактно в одну строку, без подписей над полями (подпись — в пустом варианте и
 * aria-label). «Сбросить» снимает только свои фильтры: прочие параметры адреса остаются.
 */
export function FiltersBar({
  fields,
  inline = false,
}: {
  fields: FilterField[];
  inline?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const active = fields.some((f) => params.get(f.name));

  function reset() {
    const next = new URLSearchParams(params.toString());
    for (const f of fields) next.delete(f.name);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  if (inline)
    return (
      <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
        {fields.map((f) =>
          f.type === "select" ? (
            <select
              key={f.name}
              aria-label={f.label}
              className={cn(
                "h-8 max-w-56 rounded-lg border bg-background px-2 text-sm",
                params.get(f.name) && "border-primary text-primary",
              )}
              value={params.get(f.name) ?? ALL}
              onChange={(e) => update(f.name, e.target.value)}
            >
              <option value={ALL}>{f.allLabel ?? `${f.label}: все`}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              // Ключ со значением: после «Сбросить» поле очищается.
              key={`${f.name}:${params.get(f.name) ?? ""}`}
              aria-label={f.label}
              type={f.type === "date" ? "date" : "search"}
              placeholder={f.type === "search" ? (f.placeholder ?? f.label) : undefined}
              className={f.type === "search" ? "w-56" : "w-36"}
              defaultValue={params.get(f.name) ?? ""}
              onChange={f.type === "date" ? (e) => update(f.name, e.target.value) : undefined}
              onKeyDown={
                f.type === "search"
                  ? (e) => {
                      if (e.key === "Enter") update(f.name, e.currentTarget.value.trim());
                    }
                  : undefined
              }
              onBlur={
                f.type === "search"
                  ? (e) => update(f.name, e.currentTarget.value.trim())
                  : undefined
              }
            />
          ),
        )}
        {active ? (
          <Button variant="ghost" onClick={reset}>
            Сбросить
          </Button>
        ) : null}
      </div>
    );

  return (
    <div
      className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
      aria-busy={isPending}
    >
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <Label htmlFor={`filter-${f.name}`} className="text-xs text-muted-foreground">
            {f.label}
          </Label>
          {f.type === "select" ? (
            // Нативный select: быстрый и удобный на телефоне, без лишних кликов.
            <select
              id={`filter-${f.name}`}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={params.get(f.name) ?? ALL}
              onChange={(e) => update(f.name, e.target.value)}
            >
              <option value={ALL}>{f.allLabel ?? "Все"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`filter-${f.name}`}
              type={f.type === "date" ? "date" : "search"}
              placeholder={f.type === "search" ? f.placeholder : undefined}
              defaultValue={params.get(f.name) ?? ""}
              onChange={f.type === "date" ? (e) => update(f.name, e.target.value) : undefined}
              onKeyDown={
                f.type === "search"
                  ? (e) => {
                      if (e.key === "Enter") update(f.name, e.currentTarget.value.trim());
                    }
                  : undefined
              }
              onBlur={
                f.type === "search"
                  ? (e) => update(f.name, e.currentTarget.value.trim())
                  : undefined
              }
            />
          )}
        </div>
      ))}
      {active ? (
        <div className="flex items-end">
          <Button variant="ghost" onClick={reset}>
            Сбросить
          </Button>
        </div>
      ) : null}
    </div>
  );
}
