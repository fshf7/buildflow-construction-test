import "server-only";

import type { FilterField } from "@/components/filters-bar";
import { hasAnyPermission, type OrgAccess } from "@/lib/auth/access-model";
import type { Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { PAYABLE_STATUS_LABELS } from "@/features/finance/labels";
import { WORK_ACT_STATUS_LABELS } from "@/features/work-acts/labels";

export type ColumnKind = "text" | "date" | "money" | "qty";
export type Column = { key: string; label: string; kind: ColumnKind; total?: boolean };
export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;
export type ReportData = {
  columns: Column[];
  rows: ReportRow[];
  /** Итоги по колонкам с total; null — итог не считается (разные валюты). */
  totals: Record<string, number> | null;
  currency: string | null;
};

type Params = Record<string, string | undefined>;
type Lookups = {
  projects: { id: string; label: string }[];
  crews: { id: string; label: string }[];
  accounts: { id: string; label: string }[];
};

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  /** Д-75: отчёт доступен при любом из прав; данные дополнительно режет RLS. */
  permissions: Permission[];
  filters: (l: Lookups) => FilterField[];
  /** Есть разрез по объекту (параметр project) — показывается и внутри объекта (Д-94). */
  byProject: boolean;
  load: (orgId: string, p: Params) => Promise<Omit<ReportData, "totals" | "currency">>;
};

const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const period: FilterField[] = [
  { name: "from", label: "С даты", type: "date" },
  { name: "to", label: "По дату", type: "date" },
];
const projectFilter = (l: Lookups): FilterField => ({
  name: "project",
  label: "Объект",
  type: "select",
  options: l.projects.map((p) => ({ value: p.id, label: p.label })),
});
const crewFilter = (l: Lookups): FilterField => ({
  name: "crew",
  label: "Бригада",
  type: "select",
  options: l.crews.map((c) => ({ value: c.id, label: c.label })),
});

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const supabase = await createClient();
  // Функции отчётов — SECURITY INVOKER поверх RLS (управляющий — свои объекты, склад — без цен).
  const { data, error } = await (
    supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  )(fn, args);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const REPORTS: ReportDef[] = [
  {
    key: "stock",
    title: "Остатки",
    description: "Остатки материалов на складах объектов (количество, без цен).",
    permissions: ["stock.view"],
    byProject: true,
    filters: (l) => [projectFilter(l)],
    load: async (org, p) => {
      const rows = await rpc<Record<string, unknown>>("report_stock_balances", {
        p_org: org,
        p_project: uuid(p.project),
      });
      return {
        columns: [
          { key: "project", label: "Объект", kind: "text" },
          { key: "warehouse", label: "Склад", kind: "text" },
          { key: "material", label: "Материал", kind: "text" },
          { key: "unit", label: "Ед.", kind: "text" },
          { key: "quantity", label: "Остаток", kind: "qty" },
        ],
        rows: rows.map((r) => ({
          project: `${r.project_code as string} — ${r.project_name as string}`,
          warehouse: r.warehouse_name as string,
          material: r.material_name as string,
          unit: r.unit_code as string,
          quantity: Number(r.quantity),
        })),
      };
    },
  },
  {
    key: "issues",
    title: "Движение материалов",
    description: "Выдачи и возвраты по объекту, блоку, этажу и бригаде (проведённые документы).",
    permissions: ["stock.view", "stock.view_own_crews"],
    byProject: true,
    filters: (l) => [...period, projectFilter(l), crewFilter(l)],
    load: async (org, p) => {
      const rows = await rpc<Record<string, unknown>>("report_material_issues", {
        p_org: org,
        p_from: date(p.from),
        p_to: date(p.to),
        p_project: uuid(p.project),
        p_block: null,
        p_floor: null,
        p_crew: uuid(p.crew),
      });
      return {
        columns: [
          { key: "project", label: "Объект", kind: "text" },
          { key: "block", label: "Блок", kind: "text" },
          { key: "floor", label: "Этаж", kind: "text" },
          { key: "crew", label: "Бригада", kind: "text" },
          { key: "material", label: "Материал", kind: "text" },
          { key: "unit", label: "Ед.", kind: "text" },
          { key: "issued", label: "Выдано", kind: "qty" },
          { key: "returned", label: "Возвращено", kind: "qty" },
          { key: "net", label: "Расход", kind: "qty" },
        ],
        rows: rows.map((r) => ({
          project: r.project_code as string,
          block: (r.block_name as string | null) ?? "",
          floor: (r.floor_name as string | null) ?? "",
          crew: r.crew_name as string,
          material: r.material_name as string,
          unit: r.unit_code as string,
          issued: Number(r.issued),
          returned: Number(r.returned),
          net: Number(r.net),
        })),
      };
    },
  },
  {
    key: "payables",
    title: "Долги поставщикам и бригадам",
    description: "Обязательства: сумма, оплачено, остаток долга и дата последней оплаты.",
    permissions: ["payables.view"],
    byProject: true,
    filters: (l) => [
      {
        name: "kind",
        label: "Кому",
        type: "select",
        options: [
          { value: "SUPPLIER", label: "Поставщикам" },
          { value: "CREW", label: "Бригадам" },
        ],
      },
      projectFilter(l),
      {
        name: "open",
        label: "Только открытые",
        type: "select",
        options: [{ value: "1", label: "Да" }],
      },
    ],
    load: async (org, p) => {
      const rows = await rpc<Record<string, unknown>>("report_payables", {
        p_org: org,
        p_kind: p.kind === "SUPPLIER" || p.kind === "CREW" ? p.kind : null,
        p_project: uuid(p.project),
        p_open_only: p.open === "1",
      });
      return {
        columns: [
          { key: "counterparty", label: "Контрагент", kind: "text" },
          { key: "project", label: "Объект", kind: "text" },
          { key: "document", label: "Основание", kind: "text" },
          { key: "date", label: "Дата", kind: "date" },
          { key: "amount", label: "Сумма", kind: "money", total: true },
          { key: "paid", label: "Оплачено", kind: "money", total: true },
          { key: "remaining", label: "Остаток долга", kind: "money", total: true },
          { key: "currency", label: "Валюта", kind: "text" },
          { key: "status", label: "Статус", kind: "text" },
          { key: "lastPayment", label: "Последняя оплата", kind: "date" },
        ],
        rows: rows.map((r) => ({
          counterparty: `${r.counterparty_kind === "CREW" ? "Бригада" : "Поставщик"}: ${r.counterparty_name as string}`,
          project: (r.project_code as string | null) ?? "",
          document:
            r.source_doc_type === "WORK_ACT"
              ? `Акт ${(r.source_number as string | null) ?? ""}`
              : r.source_doc_type === "SUPPLIER_INVOICE"
                ? `Накладная ${(r.source_number as string | null) ?? ""}`
                : `Ввод остатков ${(r.source_number as string | null) ?? ""}`,
          date: r.doc_date as string | null,
          amount: Number(r.amount),
          paid: Number(r.paid),
          remaining: Number(r.remaining),
          currency: r.currency as string,
          status:
            PAYABLE_STATUS_LABELS[r.status as keyof typeof PAYABLE_STATUS_LABELS] ??
            (r.status as string),
          lastPayment: r.last_payment_date as string | null,
        })),
      };
    },
  },
  {
    key: "cash",
    title: "Балансы и движение касс",
    description: "Начальный баланс, приходы, расходы и конечный баланс каждой кассы за период.",
    permissions: ["cash.view"],
    byProject: false,
    filters: (l) => [
      ...period,
      {
        name: "account",
        label: "Касса",
        type: "select",
        options: l.accounts.map((a) => ({ value: a.id, label: a.label })),
      },
    ],
    load: async (org, p) => {
      const rows = await rpc<Record<string, unknown>>("report_cash", {
        p_org: org,
        p_from: date(p.from),
        p_to: date(p.to),
        p_account: uuid(p.account),
      });
      return {
        columns: [
          { key: "account", label: "Касса / счёт", kind: "text" },
          { key: "currency", label: "Валюта", kind: "text" },
          { key: "opening", label: "На начало", kind: "money", total: true },
          { key: "income", label: "Приход", kind: "money", total: true },
          { key: "expense", label: "Расход", kind: "money", total: true },
          { key: "closing", label: "На конец", kind: "money", total: true },
        ],
        rows: rows.map((r) => ({
          account: r.account_name as string,
          currency: r.currency as string,
          opening: Number(r.opening),
          income: Number(r.income),
          expense: Number(r.expense),
          closing: Number(r.closing),
        })),
      };
    },
  },
  {
    key: "acts",
    title: "Акты работ",
    description: "Акты выполненных работ: сумма, оплачено и долг по утверждённым.",
    permissions: ["work_acts.view", "work_acts.view_approved"],
    byProject: true,
    filters: (l) => [
      ...period,
      projectFilter(l),
      crewFilter(l),
      {
        name: "status",
        label: "Статус",
        type: "select",
        options: (["REVIEW", "APPROVED", "REJECTED", "CANCELLED"] as const).map((s) => ({
          value: s,
          label: WORK_ACT_STATUS_LABELS[s],
        })),
      },
    ],
    load: async (org, p) => {
      const rows = await rpc<Record<string, unknown>>("report_work_acts", {
        p_org: org,
        p_from: date(p.from),
        p_to: date(p.to),
        p_project: uuid(p.project),
        p_crew: uuid(p.crew),
        p_status: p.status && p.status in WORK_ACT_STATUS_LABELS ? p.status : null,
      });
      return {
        columns: [
          { key: "number", label: "Номер", kind: "text" },
          { key: "date", label: "Дата", kind: "date" },
          { key: "project", label: "Объект", kind: "text" },
          { key: "crew", label: "Бригада", kind: "text" },
          { key: "status", label: "Статус", kind: "text" },
          { key: "total", label: "Сумма", kind: "money", total: true },
          { key: "paid", label: "Оплачено", kind: "money", total: true },
          { key: "remaining", label: "Долг", kind: "money", total: true },
          { key: "currency", label: "Валюта", kind: "text" },
        ],
        rows: rows.map((r) => ({
          number: r.number as string,
          date: r.doc_date as string,
          project: r.project_code as string,
          crew: r.crew_name as string,
          status: WORK_ACT_STATUS_LABELS[r.status as keyof typeof WORK_ACT_STATUS_LABELS],
          total: Number(r.total),
          paid: r.paid === null ? null : Number(r.paid),
          remaining: r.remaining === null ? null : Number(r.remaining),
          currency: r.currency as string,
        })),
      };
    },
  },
];

export function findReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

export function canSeeReport(org: OrgAccess, def: ReportDef): boolean {
  return hasAnyPermission(org, def.permissions);
}

/** Итоги в копейках/десятитысячных — без накопления ошибки; при разных валютах итог не считается. */
export function withTotals(data: Omit<ReportData, "totals" | "currency">): ReportData {
  const currencies = new Set(data.rows.map((r) => r.currency).filter((c) => typeof c === "string"));
  const hasCurrency = data.columns.some((c) => c.key === "currency");
  const totalCols = data.columns.filter((c) => c.total);
  if (totalCols.length === 0 || (hasCurrency && currencies.size > 1)) {
    return { ...data, totals: null, currency: null };
  }
  const totals: Record<string, number> = {};
  for (const c of totalCols) {
    const cents = data.rows.reduce((s, r) => s + Math.round(Number(r[c.key] ?? 0) * 100), 0);
    totals[c.key] = cents / 100;
  }
  return {
    ...data,
    totals,
    currency: hasCurrency ? (([...currencies][0] as string | undefined) ?? null) : null,
  };
}

export async function loadReport(def: ReportDef, orgId: string, p: Params): Promise<ReportData> {
  return withTotals(await def.load(orgId, p));
}

export type { Lookups, Params };
