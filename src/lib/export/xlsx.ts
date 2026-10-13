import "server-only";

import ExcelJS from "exceljs";

import type { Column, ReportRow } from "@/features/reports/definitions";

const FORMAT: Record<Column["kind"], string | undefined> = {
  text: undefined,
  date: "dd.mm.yyyy",
  money: "#,##0.00",
  qty: "#,##0.####",
};

/** XLSX: числа — числами (Excel считает суммы сам), даты — датами; итоговая строка жирным (Д-76). */
export async function toXlsx(
  title: string,
  columns: Column[],
  rows: ReportRow[],
  totals: Record<string, number> | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BuildFlow";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.kind === "text" ? 28 : 16,
    style: FORMAT[c.kind] ? { numFmt: FORMAT[c.kind] } : {},
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const values: Record<string, unknown> = {};
    for (const c of columns) {
      const v = r[c.key];
      values[c.key] =
        v === null || v === undefined
          ? null
          : c.kind === "date" && typeof v === "string"
            ? new Date(`${v.slice(0, 10)}T00:00:00Z`)
            : v;
    }
    ws.addRow(values);
  }
  if (totals) {
    const row = ws.addRow({ ...totals, [columns[0]!.key]: "Итого" });
    row.font = { bold: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
