/**
 * Журнал затрат (Д-97, Д-99): строки всех накладных объекта — дата, наименование, категория,
 * кол-во, ед., цена, валюта, сумма, поставщик, накладная. Чистые функции — общие для таблицы
 * (клиент) и экспорта в Excel (сервер): фильтр и итоги на экране и в файле совпадают. Здесь же —
 * разбор строк, вставленных из Excel / Google Таблиц в накладную.
 */
import type { InvoiceStatus } from "./labels";

export type ExpenseRow = {
  /** Ключ строки таблицы: у старых многострочных накладных строк несколько на один документ. */
  key: string;
  invoiceId: string;
  number: string | null;
  status: InvoiceStatus;
  docDate: string;
  description: string;
  materialId: string | null;
  categoryId: string | null;
  quantity: number;
  unitId: string;
  unitCode: string;
  /** null — у пользователя нет права видеть цены (склад, Д-24). */
  price: number | null;
  amount: number | null;
  currency: string;
  supplierId: string;
  supplierName: string;
  docNumber: string | null;
};

/** Валюты затрат; сомони в таблице — «смн», как в привычном журнале. */
export const EXPENSE_CURRENCIES = [
  { code: "TJS", label: "смн" },
  { code: "USD", label: "USD" },
  { code: "RUB", label: "RUB" },
  { code: "CNY", label: "CNY" },
] as const;

export function currencyLabel(code: string): string {
  return EXPENSE_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}

export type ExpenseFilters = {
  from?: string;
  to?: string;
  text?: string;
  categoryId?: string;
  supplierId?: string;
  currency?: string;
  showCancelled?: boolean;
};

const lower = (s: string) => s.toLocaleLowerCase("ru").trim();

export function filterExpenseRows(rows: ExpenseRow[], f: ExpenseFilters): ExpenseRow[] {
  const text = f.text ? lower(f.text) : "";
  return rows.filter((r) => {
    if (!f.showCancelled && r.status === "CANCELLED") return false;
    if (f.from && r.docDate < f.from) return false;
    if (f.to && r.docDate > f.to) return false;
    if (f.categoryId && r.categoryId !== f.categoryId) return false;
    if (f.supplierId && r.supplierId !== f.supplierId) return false;
    if (f.currency && r.currency !== f.currency) return false;
    if (
      text &&
      !lower(r.description).includes(text) &&
      !lower(r.supplierName).includes(text) &&
      !lower(r.docNumber ?? "").includes(text) &&
      !lower(r.number ?? "").includes(text)
    ) {
      return false;
    }
    return true;
  });
}

/** Итоги по валютам (в копейках — без накопления ошибки двоичной арифметики). */
export function totalsByCurrency(rows: Pick<ExpenseRow, "amount" | "currency" | "status">[]) {
  const cents = new Map<string, number>();
  for (const r of rows) {
    if (r.amount === null || r.status === "CANCELLED") continue;
    cents.set(r.currency, (cents.get(r.currency) ?? 0) + Math.round(r.amount * 100));
  }
  return [...cents].map(([currency, c]) => ({ currency, total: c / 100 }));
}

// ---------------------------------------------------------------------------------------
// Вставка из Excel / Google Таблиц (табы и переводы строк)
// ---------------------------------------------------------------------------------------

/** «01.06.2026» / «1.6.26» / «2026-06-01» → «2026-06-01»; иначе null. */
export function parseRuDate(value: string): string | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return v;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(v);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y!.length === 2 ? `20${y}` : y!;
  const dd = d!.padStart(2, "0");
  const mm = mo!.padStart(2, "0");
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${year}-${mm}-${dd}`;
}

/** «3 840,00» / «3840.5» / «1 100» → «3840,00» (строка для поля ввода); иначе "". */
export function parseRuNumber(value: string): string {
  const v = value.replace(/[\s  ]/g, "").replace(/[^\d.,-]/g, "");
  if (!v) return "";
  // Последний разделитель — десятичный, остальные — разряды.
  const last = Math.max(v.lastIndexOf(","), v.lastIndexOf("."));
  const int = (last >= 0 ? v.slice(0, last) : v).replace(/[.,]/g, "");
  const frac = last >= 0 ? v.slice(last + 1) : "";
  if (!/^\d+$/.test(int || "0") || (frac && !/^\d+$/.test(frac))) return "";
  return frac ? `${int || "0"},${frac}` : int;
}

export type Lookup = { id: string; name: string };

export type PastedRow = {
  docDate: string;
  description: string;
  categoryId: string;
  quantity: string;
  unitId: string;
  price: string;
  currency: string;
  supplierId: string;
  docNumber: string;
  /** Что не удалось сопоставить со справочниками — подсвечивается в таблице. */
  unmatched: string[];
};

function match(items: Lookup[], value: string): string {
  const v = lower(value);
  if (!v) return "";
  return items.find((i) => lower(i.name) === v)?.id ?? "";
}

function matchCurrency(value: string): string {
  const v = lower(value).replace(/\.$/, "");
  if (!v || ["смн", "сомони", "tjs", "с"].includes(v)) return "TJS";
  if (["$", "usd", "долл", "доллар"].includes(v)) return "USD";
  if (["руб", "rub", "₽"].includes(v)) return "RUB";
  if (["cny", "юань", "¥"].includes(v)) return "CNY";
  return "";
}

/**
 * Колонки — как в журнале на скриншоте: Дата, Наименование, Категория, Кол-во, Ед. изм.,
 * Цена за ед., Валюта, Сумма (пересчитывается, игнорируется), Поставщик, [№ накладной].
 * Строка заголовка («Дата», «Наименование…») пропускается.
 */
export function parsePastedRows(
  text: string,
  lookups: { categories: Lookup[]; units: Lookup[]; suppliers: Lookup[] },
): PastedRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const rows: PastedRow[] = [];
  for (const line of lines) {
    const c = line.split("\t").map((s) => s.trim());
    if (/^дата$/i.test(c[0] ?? "")) continue;
    const [date = "", description = "", category = "", qty = "", unit = "", price = "", cur = ""] =
      c;
    const supplier = c[8] ?? "";
    const docNumber = c[9] ?? "";
    const row: PastedRow = {
      docDate: parseRuDate(date) ?? "",
      description,
      categoryId: match(lookups.categories, category),
      quantity: parseRuNumber(qty),
      unitId: match(lookups.units, unit),
      price: parseRuNumber(price),
      currency: matchCurrency(cur),
      supplierId: match(lookups.suppliers, supplier),
      docNumber,
      unmatched: [],
    };
    if (date && !row.docDate) row.unmatched.push(`дата «${date}»`);
    if (category && !row.categoryId) row.unmatched.push(`категория «${category}»`);
    if (unit && !row.unitId) row.unmatched.push(`ед. «${unit}»`);
    if (supplier && !row.supplierId) row.unmatched.push(`поставщик «${supplier}»`);
    if (cur && !row.currency) row.unmatched.push(`валюта «${cur}»`);
    rows.push(row);
  }
  return rows;
}

/** Строка накладной из вставки: наименование, категория, кол-во, ед., цена. */
export type PastedLine = Pick<
  PastedRow,
  "description" | "categoryId" | "quantity" | "unitId" | "price" | "unmatched"
>;

/**
 * Вставка строк в накладную (Д-99). Понимает два формата:
 * — строки накладной: Наименование, Категория, Кол-во, Ед., Цена[, Сумма];
 * — журнал затрат (как на скриншоте, первая колонка — дата): тогда дата, валюта и поставщик
 *   первой строки возвращаются для шапки накладной.
 */
export function parsePastedLines(
  text: string,
  lookups: { categories: Lookup[]; units: Lookup[]; suppliers: Lookup[] },
): {
  lines: PastedLine[];
  header: { docDate: string; currency: string; supplierId: string } | null;
} {
  const rawLines = text.replace(/\r/g, "").split("\n");
  const first = rawLines
    .map((l) => l.split("\t")[0]?.trim() ?? "")
    .find((c) => c !== "" && !/^(дата|наименование)/i.test(c));
  if (first && parseRuDate(first)) {
    const rows = parsePastedRows(text, lookups);
    const head = rows[0];
    return {
      lines: rows.map(({ description, categoryId, quantity, unitId, price, unmatched }) => ({
        description,
        categoryId,
        quantity,
        unitId,
        price,
        unmatched: unmatched.filter((u) => !u.startsWith("дата") && !u.startsWith("поставщик")),
      })),
      header: head
        ? { docDate: head.docDate, currency: head.currency, supplierId: head.supplierId }
        : null,
    };
  }
  const lines: PastedLine[] = [];
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const c = line.split("\t").map((s) => s.trim());
    if (/^наименование/i.test(c[0] ?? "")) continue;
    const [description = "", category = "", qty = "", unit = "", price = ""] = c;
    const row: PastedLine = {
      description,
      categoryId: match(lookups.categories, category),
      quantity: parseRuNumber(qty),
      unitId: match(lookups.units, unit),
      price: parseRuNumber(price),
      unmatched: [],
    };
    if (category && !row.categoryId) row.unmatched.push(`категория «${category}»`);
    if (unit && !row.unitId) row.unmatched.push(`ед. «${unit}»`);
    lines.push(row);
  }
  return { lines, header: null };
}
