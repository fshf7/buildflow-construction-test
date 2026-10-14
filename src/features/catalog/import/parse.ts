import { IMPORT_KINDS, MAX_IMPORT_ROWS, type ImportKind } from "./columns";

/** Значение ячейки после чтения файла: строка, число, дата, логическое или пусто. */
export type Cell = string | number | boolean | Date | null;
export type ImportRow = { row: number; [key: string]: string | number };

/** Значение поля строки как текст. */
export const field = (r: ImportRow, key: string): string => String(r[key] ?? "");
export type RowError = { row: number; message: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function cellText(v: Cell): string {
  if (v === null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, " ").trim();
}

/**
 * Разбор листа: первая непустая строка — заголовки (по названиям колонок шаблона, без учёта
 * регистра и порядка), далее данные. Пустые строки пропускаются; номер строки — как в Excel.
 */
export function parseSheet(
  kind: ImportKind,
  matrix: Cell[][],
): { rows: ImportRow[]; errors: RowError[] } {
  const columns = IMPORT_KINDS[kind].columns;
  const headerIndex = matrix.findIndex((r) => r.some((c) => cellText(c) !== ""));
  if (headerIndex < 0) return { rows: [], errors: [{ row: 1, message: "Файл пустой" }] };

  const header = matrix[headerIndex]!.map((c) => norm(cellText(c)));
  const position = new Map<string, number>();
  for (const col of columns) {
    const i = header.indexOf(norm(col.header));
    if (i >= 0) position.set(col.key, i);
  }
  const missing = columns
    .filter((c) => c.required && !position.has(c.key))
    .map((c) => `«${c.header}»`);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: headerIndex + 1,
          message: `Нет обязательных колонок: ${missing.join(", ")}. Скачайте шаблон.`,
        },
      ],
    };
  }

  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const values: Record<string, string> = {};
    for (const col of columns) {
      const at = position.get(col.key);
      values[col.key] = at === undefined ? "" : cellText(cells[at] ?? null);
    }
    if (Object.values(values).every((v) => v === "")) continue;
    const row = i + 1;
    for (const col of columns) {
      if (col.required && !values[col.key])
        errors.push({ row, message: `не заполнено «${col.header}»` });
    }
    if (values.name && values.name.length > 200)
      errors.push({ row, message: "название длиннее 200 символов" });
    rows.push({ ...values, row });
  }
  if (rows.length === 0 && errors.length === 0)
    errors.push({ row: headerIndex + 2, message: "Нет строк с данными" });
  if (rows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: rows[MAX_IMPORT_ROWS]!.row,
      message: `Не больше ${MAX_IMPORT_ROWS} строк за раз`,
    });
  }
  return { rows, errors };
}
