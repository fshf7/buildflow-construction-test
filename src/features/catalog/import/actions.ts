"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { getCurrentOrg } from "@/lib/auth/access";
import { hasPermission, type OrgAccess } from "@/lib/auth/access-model";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import {
  IMPORT_KINDS,
  isImportKind,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type ImportKind,
} from "./columns";
import { field, parseSheet, type ImportRow, type RowError } from "./parse";
import { readFirstSheet } from "./read-xlsx";

export type PreviewRow = {
  row: number;
  values: Record<string, string>;
  status: "new" | "exists" | "error";
  messages: string[];
};
export type Preview = { kind: ImportKind; rows: PreviewRow[]; fileErrors: RowError[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function canImport(org: OrgAccess, kind: ImportKind): boolean {
  return hasPermission(org, kind === "crews" ? "crews.manage" : "catalog.manage");
}

async function guard(
  kind: ImportKind,
): Promise<{ ok: true; org: OrgAccess } | { ok: false; error: string }> {
  const org = await getCurrentOrg();
  if (!org || !canImport(org, kind))
    return { ok: false, error: "Недостаточно прав для этого действия" };
  const user = await getCurrentUser();
  const limit = await rateLimit([{ name: "import_user", value: user?.id ?? "anonymous" }]);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfterSec) };
  return { ok: true, org };
}

/**
 * Шаг 1: файл → строки с проверкой. Окончательная проверка — в БД при импорте (import_catalog);
 * здесь — чтобы показать ошибки по строкам до записи.
 */
export async function previewImport(formData: FormData): Promise<ActionResult<Preview>> {
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (!isImportKind(kind)) return fail("Неизвестный справочник");
  const g = await guard(kind);
  if (!g.ok) return fail(g.error);
  if (!(file instanceof File) || file.size === 0) return fail("Выберите файл");
  if (file.size > MAX_IMPORT_BYTES) return fail("Файл больше 2 МБ — разбейте на части");
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    return fail("Нужен файл Excel .xlsx (шаблон можно скачать выше)");

  let matrix;
  try {
    matrix = await readFirstSheet(await file.arrayBuffer());
  } catch {
    return fail("Не удалось прочитать файл — сохраните его в Excel как .xlsx");
  }
  const { rows, errors } = parseSheet(kind, matrix);
  if (rows.length === 0) return ok({ kind, rows: [], fileErrors: errors });

  const supabase = await createClient();
  const orgId = g.org.id;
  const rowErrors = new Map<number, string[]>();
  for (const e of errors) rowErrors.set(e.row, [...(rowErrors.get(e.row) ?? []), e.message]);
  const addError = (row: number, m: string) =>
    rowErrors.set(row, [...(rowErrors.get(row) ?? []), m]);
  const exists = new Set<number>();

  // Ключ сравнения строки — как в БД: код/ИНН, если указан, иначе название.
  const keyOf = (r: ImportRow) =>
    kind === "materials" && field(r, "code")
      ? `c:${norm(field(r, "code"))}`
      : kind === "suppliers" && field(r, "tax_id")
        ? `t:${norm(field(r, "tax_id"))}`
        : `n:${norm(field(r, "name"))}`;
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!field(r, "name")) continue;
    const k = keyOf(r);
    if (seen.has(k)) addError(r.row, `повтор строки ${seen.get(k)}`);
    else seen.set(k, r.row);
  }

  if (kind === "materials") {
    const [{ data: units }, { data: mats }] = await Promise.all([
      supabase.from("units_of_measure").select("code").eq("organization_id", orgId),
      supabase.from("materials").select("name, code").eq("organization_id", orgId),
    ]);
    const unitCodes = new Set((units ?? []).map((u) => norm(u.code)));
    const keys = new Set(
      (mats ?? []).flatMap((m) => [`n:${norm(m.name)}`, ...(m.code ? [`c:${norm(m.code)}`] : [])]),
    );
    for (const r of rows) {
      if (field(r, "unit_code") && !unitCodes.has(norm(field(r, "unit_code"))))
        addError(r.row, `неизвестная единица «${field(r, "unit_code")}»`);
      if (keys.has(keyOf(r))) exists.add(r.row);
    }
  } else if (kind === "suppliers") {
    const { data } = await supabase
      .from("suppliers")
      .select("name, tax_id")
      .eq("organization_id", orgId);
    const keys = new Set(
      (data ?? []).flatMap((s) => [
        `n:${norm(s.name)}`,
        ...(s.tax_id ? [`t:${norm(s.tax_id)}`] : []),
      ]),
    );
    for (const r of rows) if (keys.has(keyOf(r))) exists.add(r.row);
  } else {
    const [{ data: crews }, { data: members }] = await Promise.all([
      supabase.from("crews").select("name").eq("organization_id", orgId),
      supabase
        .from("organization_members")
        .select("email, is_active, member_roles(roles(code))")
        .eq("organization_id", orgId),
    ]);
    const names = new Set((crews ?? []).map((c) => `n:${norm(c.name)}`));
    const foremen = new Set(
      (members ?? [])
        .filter((m) => m.is_active && m.member_roles.some((mr) => mr.roles?.code === "foreman"))
        .map((m) => norm(m.email)),
    );
    for (const r of rows) {
      if (field(r, "foreman_email") && !foremen.has(norm(field(r, "foreman_email")))) {
        addError(r.row, `прораб ${field(r, "foreman_email")} не найден среди активных прорабов`);
      }
      if (names.has(keyOf(r))) exists.add(r.row);
    }
  }

  return ok({
    kind,
    fileErrors: errors.filter((e) => !rows.some((r) => r.row === e.row)),
    rows: rows.map((r): PreviewRow => {
      const messages = rowErrors.get(r.row) ?? [];
      return {
        row: r.row,
        values: Object.fromEntries(IMPORT_KINDS[kind].columns.map((c) => [c.key, field(r, c.key)])),
        messages,
        status: messages.length ? "error" : exists.has(r.row) ? "exists" : "new",
      };
    }),
  });
}

const runSchema = z.object({
  kind: z.enum(["materials", "suppliers", "crews"]),
  key: z.uuid(),
  mode: z.enum(["skip", "update"]),
  rows: z
    .array(z.record(z.string(), z.union([z.string().max(500), z.number()])))
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

/** Шаг 2: импорт — всё или ничего, повтор с тем же ключом не создаёт дублей (import_catalog). */
export async function runImport(
  input: unknown,
): Promise<ActionResult<{ created: number; updated: number; skipped: number }>> {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return fail("Некорректные данные импорта — загрузите файл заново");
  const { kind, key, mode, rows } = parsed.data;
  const g = await guard(kind);
  if (!g.ok) return fail(g.error);
  const allowed = new Set(["row", ...IMPORT_KINDS[kind].columns.map((c) => c.key)]);
  const clean = rows.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k))),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_catalog", {
    p_org: g.org.id,
    p_kind: kind,
    p_key: key,
    p_rows: clean,
    p_mode: mode,
  });
  if (error) {
    if (error.message === "BF_IMPORT_INVALID") {
      try {
        const details = JSON.parse(error.details ?? "[]") as RowError[];
        return fail(
          `Импорт отменён, ничего не записано. ${details.map((d) => `Строка ${d.row}: ${d.message}`).join("; ")}`,
        );
      } catch {
        return fail("Импорт отменён: в файле есть ошибки");
      }
    }
    if (error.message === "BF_IMPORT_SIZE")
      return fail(`Нужна хотя бы одна строка и не больше ${MAX_IMPORT_ROWS}`);
    return fail(dbErrorMessage(error));
  }
  revalidatePath("/catalog");
  revalidatePath("/crews", "layout");
  return ok(data as { created: number; updated: number; skipped: number });
}
