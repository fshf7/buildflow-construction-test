import type { Column, ReportRow } from "@/features/reports/definitions";

const BOM = "﻿";

function cell(value: unknown, kind: Column["kind"]): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (kind === "money") s = Number(value).toFixed(2).replace(".", ",");
  else if (kind === "qty") s = String(Number(value)).replace(".", ",");
  else if (kind === "date" && typeof value === "string") {
    const [y, m, d] = value.slice(0, 10).split("-");
    s = `${d}.${m}.${y}`;
  } else s = String(value);
  // Защита от формул в Excel (CSV injection): текст, начинающийся с = + - @, — экранируем апострофом.
  if (kind === "text" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV для русского Excel (Д-76): UTF-8 с BOM, разделитель «;», десятичная запятая, даты ДД.ММ.ГГГГ.
 * Итоговая строка — те же суммы, что на экране.
 */
export function toCsv(
  columns: Column[],
  rows: ReportRow[],
  totals: Record<string, number> | null,
): string {
  const lines = [columns.map((c) => cell(c.label, "text")).join(";")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key], c.kind)).join(";"));
  if (totals) {
    lines.push(
      columns
        .map((c, i) => (i === 0 ? "Итого" : c.key in totals ? cell(totals[c.key], c.kind) : ""))
        .join(";"),
    );
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
