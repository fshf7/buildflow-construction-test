"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";

/**
 * Период отчёта склада одной строкой (Д-106): «с … по …» в адресе (?from=&to=), вкладка
 * отчёта (?view=) сохраняется.
 */
export function ReportPeriod({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(name: "from" | "to", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex items-center gap-2 text-sm" aria-busy={isPending}>
      <label htmlFor="report-from" className="text-muted-foreground">
        с
      </label>
      <Input
        id="report-from"
        type="date"
        className="w-36"
        defaultValue={from}
        onChange={(e) => update("from", e.target.value)}
      />
      <label htmlFor="report-to" className="text-muted-foreground">
        по
      </label>
      <Input
        id="report-to"
        type="date"
        className="w-36"
        defaultValue={to}
        onChange={(e) => update("to", e.target.value)}
      />
    </div>
  );
}
