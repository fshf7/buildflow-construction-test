import ExcelJS from "exceljs";

import { IMPORT_KINDS, isImportKind } from "@/features/catalog/import/columns";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasPermission } from "@/lib/auth/access-model";

// Шаблон импорта: лист с колонками и примером + лист «Инструкция».
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isImportKind(kind)) return new Response("Неизвестный справочник", { status: 404 });
  const org = await getCurrentOrg();
  if (!org || !hasPermission(org, kind === "crews" ? "crews.manage" : "catalog.manage")) {
    return new Response("Недостаточно прав", { status: 403 });
  }
  const def = IMPORT_KINDS[kind];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(def.title);
  ws.columns = def.columns.map((c) => ({ header: c.header, key: c.key, width: 28 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(def.columns.map((c) => [c.key, c.example])));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("Инструкция");
  help.columns = [{ width: 24 }, { width: 14 }, { width: 70 }];
  help.addRow(["Колонка", "Обязательна", "Пояснение"]).font = { bold: true };
  for (const c of def.columns) help.addRow([c.header, c.required ? "да" : "нет", c.hint ?? ""]);
  help.addRow([]);
  help.addRow([
    "Строку-пример на первом листе замените своими данными. Импорт — всё или ничего: при ошибке не записывается ни одна строка.",
  ]);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="buildflow-${kind}-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
