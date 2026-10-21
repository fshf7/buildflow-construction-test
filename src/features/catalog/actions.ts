"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { emptyToNull } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  expenseCategorySchema,
  materialSchema,
  serviceSchema,
  supplierSchema,
  unitSchema,
  workStageSchema,
} from "./schemas";

type PgError = { code?: string; message?: string } | null;

function saved(error: PgError, duplicate: string): ActionResult {
  if (error) return fail(error.code === "23505" ? duplicate : dbErrorMessage(error));
  revalidatePath("/catalog");
  return ok();
}

/** Справочники правит catalog.manage; читают все участники организации (RLS). */
export async function saveUnit(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = { code: v.code, name: v.name, decimals: v.decimals };
  const { error } = id
    ? await supabase
        .from("units_of_measure")
        .update(row)
        .eq("id", id)
        .eq("organization_id", auth.org.id)
    : await supabase.from("units_of_measure").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Единица с таким обозначением уже есть");
}

export async function saveMaterial(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = materialSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = {
    code: emptyToNull(v.code),
    name: v.name,
    unit_id: v.unitId,
    category: emptyToNull(v.category),
    is_active: v.isActive,
  };
  // Д-21: единицу материала с движениями БД менять не даст (BF_UNIT_LOCKED → понятное сообщение).
  const { error } = id
    ? await supabase.from("materials").update(row).eq("id", id).eq("organization_id", auth.org.id)
    : await supabase.from("materials").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Материал с таким кодом уже есть");
}

export async function saveSupplier(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = {
    name: v.name,
    tax_id: emptyToNull(v.taxId),
    phone: emptyToNull(v.phone),
    contact_person: emptyToNull(v.contactPerson),
    address: emptyToNull(v.address),
    is_active: v.isActive,
  };
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id).eq("organization_id", auth.org.id)
    : await supabase.from("suppliers").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Поставщик с таким ИНН уже есть");
}

export async function saveExpenseCategory(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = {
    name: v.name,
    color: v.color,
    via_warehouse: v.viaWarehouse,
    sort_order: v.sortOrder,
    is_active: v.isActive,
  };
  const { error } = id
    ? await supabase
        .from("expense_categories")
        .update(row)
        .eq("id", id)
        .eq("organization_id", auth.org.id)
    : await supabase.from("expense_categories").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Категория с таким названием уже есть");
}

export async function saveWorkStage(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = workStageSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = { name: v.name, sort_order: v.sortOrder, is_active: v.isActive };
  const { error } = id
    ? await supabase.from("work_stages").update(row).eq("id", id).eq("organization_id", auth.org.id)
    : await supabase.from("work_stages").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Этап с таким названием уже есть");
}

export async function saveService(input: unknown): Promise<ActionResult> {
  const auth = await authorize("catalog.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы");
  const { id, ...v } = parsed.data;

  const supabase = await createClient();
  const row = { name: v.name, unit_id: v.unitId, is_active: v.isActive };
  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id).eq("organization_id", auth.org.id)
    : await supabase.from("services").insert({ ...row, organization_id: auth.org.id });
  return saved(error, "Услуга с таким названием уже есть");
}
