import "server-only";

import ExcelJS from "exceljs";

import type { Cell } from "./parse";

/** Первый лист XLSX → матрица значений. Формулы — их результат; rich text и ссылки — текст. */
export async function readFirstSheet(buffer: ArrayBuffer): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const matrix: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = toCell(cell.value);
    });
    matrix[rowNumber - 1] = cells;
  });
  return Array.from(matrix, (r) => r ?? []);
}

function toCell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date)
    return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("formula" in v || "sharedFormula" in v)
      return toCell((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}
