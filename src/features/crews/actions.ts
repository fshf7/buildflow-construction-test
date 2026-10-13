"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorize } from "@/lib/auth/guard";
import { toNumber } from "@/lib/decimal";
import { emptyToNull } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { crewMemberSchema, workRateSchema } from "./schemas";

/** Состав бригады — справочник (люди, не пользователи системы); запись под RLS crews.manage. */
export async function saveCrewMember(input: unknown): Promise<ActionResult> {
  const auth = await authorize("crews.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = crewMemberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const { id, crewId, ...v } = parsed.data;
  const row = {
    full_name: v.fullName,
    phone: emptyToNull(v.phone),
    position: emptyToNull(v.position),
    is_active: v.isActive,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("crew_members")
        .update(row)
        .eq("id", id)
        .eq("organization_id", auth.org.id)
    : await supabase
        .from("crew_members")
        .insert({ ...row, crew_id: crewId, organization_id: auth.org.id });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/crews", "layout");
  return ok();
}

/** Тариф с даты (Д-69: только управляющий; Д-70: изменение = новая строка, использованный не правится). */
export async function saveWorkRate(input: unknown): Promise<ActionResult> {
  const auth = await authorize("work_rates.manage");
  if (!auth.ok) return fail(auth.error);
  const parsed = workRateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_work_rate", {
    p_id: v.id,
    p_crew_id: v.crewId,
    p_project_id: (v.projectId || null) as string,
    p_work_type: v.workType,
    p_unit_id: v.unitId,
    p_rate: toNumber(v.rate),
    p_currency: v.currency,
    p_valid_from: v.validFrom,
    p_note: v.note,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/crews", "layout");
  return ok();
}
