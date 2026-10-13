"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Balance } from "../queries";

/** Остатки склада с поиском. Только количества — цен у склада нет (§5.4). */
export function StockList({ balances, projectId }: { balances: Balance[]; projectId: string }) {
  const [q, setQ] = useState("");
  const shown = balances.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        placeholder="Поиск материала"
        aria-label="Поиск материала"
        className="h-11 text-base"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {balances.length === 0 ? "На складе пока ничего нет" : "Ничего не найдено"}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {shown.map((b) => (
            <li key={b.materialId}>
              <Link
                href={`/warehouse/stock/${b.materialId}?project=${projectId}`}
                className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
              >
                <span className={cn(b.quantity === 0 && "text-muted-foreground")}>{b.name}</span>
                <span
                  className={cn(
                    "font-medium whitespace-nowrap tabular-nums",
                    b.quantity === 0 && "text-muted-foreground",
                  )}
                >
                  {formatQuantity(b.quantity, b.unit)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
