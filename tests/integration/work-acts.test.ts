import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

import { LOCAL_FOREMAN, LOCAL_PM, LOCAL_PM2 } from "../../scripts/local-admin.mts";
import { createFixture, must, service, signIn, type Fixture } from "./setup";

// Фаза 4: параллельное утверждение акта даёт одно обязательство; управляющий чужого объекта
// не видит и не утверждает акт и через API (REST и RPC).
let fx: Fixture;
let foreman: SupabaseClient<Database>;
let pm: SupabaseClient<Database>;
let pm2: SupabaseClient<Database>;
let crewId: string;

beforeAll(async () => {
  fx = await createFixture("acts");
  const members = must(
    await service
      .from("organization_members")
      .select("id, email")
      .eq("organization_id", fx.orgId)
      .in("email", [LOCAL_FOREMAN.email, LOCAL_PM.email]),
  );
  must(
    await service
      .from("project_members")
      .insert(
        members.map((m) => ({
          organization_id: fx.orgId,
          project_id: fx.projectId,
          member_id: m.id,
        })),
      )
      .select("id"),
  );
  const crew = must(
    await service
      .from("crews")
      .insert({ organization_id: fx.orgId, name: `Бригада IT ${randomUUID().slice(0, 8)}` })
      .select("id")
      .single(),
  );
  crewId = crew.id;
  const m2 = must(
    await service
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", fx.orgId)
      .eq("code", "м²")
      .single(),
  );
  must(
    await service
      .from("work_rates")
      .insert({
        organization_id: fx.orgId,
        crew_id: crewId,
        project_id: fx.projectId,
        work_type: "Фасад",
        unit_id: m2.id,
        rate: 30,
        valid_from: "2026-01-01",
      })
      .select("id"),
  );
  foreman = await signIn(LOCAL_FOREMAN.email, LOCAL_FOREMAN.password);
  pm = await signIn(LOCAL_PM.email, LOCAL_PM.password);
  pm2 = await signIn(LOCAL_PM2.email, LOCAL_PM2.password);
});

async function submittedAct(): Promise<string> {
  const id = randomUUID();
  must(
    await foreman.rpc("save_work_act_draft", {
      p_id: id,
      p_project_id: fx.projectId,
      p_crew_id: crewId,
      p_doc_date: "2026-10-12",
      p_period_from: null as unknown as string,
      p_period_to: null as unknown as string,
      p_note: "",
      p_lines: [{ work_type: "Фасад", quantity: 5000 }],
    }),
  );
  must(await foreman.rpc("submit_work_act", { p_id: id, p_key: randomUUID() }));
  return id;
}

describe("утверждение акта", () => {
  it("10 параллельных утверждений — одно обязательство на 150 000", async () => {
    const id = await submittedAct();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        pm.rpc("approve_work_act", { p_id: id, p_key: randomUUID() }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    // Остальные — «уже в другом статусе», без второго эффекта.
    expect(new Set(results.filter((r) => r.error).map((r) => r.error!.message))).toEqual(
      new Set(["BF_INVALID_STATUS"]),
    );
    const payables = must(
      await service
        .from("payables")
        .select("amount, counterparty_kind")
        .eq("source_doc_type", "WORK_ACT")
        .eq("source_doc_id", id),
    );
    expect(payables).toEqual([{ amount: 150000, counterparty_kind: "CREW" }]);
  });

  it("повтор с одним ключом в параллель — один ответ, одно обязательство", async () => {
    const id = await submittedAct();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => pm.rpc("approve_work_act", { p_id: id, p_key: key })),
    );
    expect(
      results.every((r) => !r.error && (r.data as { status: string }).status === "APPROVED"),
    ).toBe(true);
    const { count } = await service
      .from("payables")
      .select("id", { count: "exact", head: true })
      .eq("source_doc_id", id);
    expect(count).toBe(1);
  });
});

describe("управляющий чужого объекта через API", () => {
  it("REST: акт, строки и обязательство не видны", async () => {
    const id = await submittedAct();
    expect(must(await pm2.from("work_completion_acts").select("id").eq("id", id))).toEqual([]);
    expect(
      must(await pm2.from("work_completion_items").select("id").eq("work_completion_act_id", id)),
    ).toEqual([]);
    must(await pm.rpc("approve_work_act", { p_id: id, p_key: randomUUID() }));
    expect(must(await pm2.from("payables").select("id").eq("source_doc_id", id))).toEqual([]);
  });

  it("RPC: утвердить, отклонить и отменить нельзя (42501)", async () => {
    const id = await submittedAct();
    for (const r of [
      await pm2.rpc("approve_work_act", { p_id: id, p_key: randomUUID() }),
      await pm2.rpc("reject_work_act", { p_id: id, p_key: randomUUID(), p_comment: "чужой" }),
      await pm2.rpc("cancel_work_act", { p_id: id, p_key: randomUUID(), p_reason: "чужой" }),
    ]) {
      expect(r.error?.code).toBe("42501");
    }
    const act = must(
      await service.from("work_completion_acts").select("status").eq("id", id).single(),
    );
    expect(act.status).toBe("REVIEW");
  });

  it("RPC отчётов: данные чужого объекта не попадают", async () => {
    const acts = must(await pm2.rpc("report_work_acts", { p_org: fx.orgId }));
    expect(acts.some((a) => a.project_code.startsWith("IT-acts"))).toBe(false);
    const debts = must(await pm2.rpc("report_payables", { p_org: fx.orgId }));
    expect(debts.some((d) => (d.project_code ?? "").startsWith("IT-acts"))).toBe(false);
  });

  it("прямые записи запрещены: INSERT/UPDATE актов и тарифов", async () => {
    const id = await submittedAct();
    const upd = await pm
      .from("work_completion_acts")
      .update({ total_amount: 1 })
      .eq("id", id)
      .select("id");
    expect(upd.error?.code).toBe("42501");
    const ins = await pm.from("work_rates").insert({
      organization_id: fx.orgId,
      crew_id: crewId,
      work_type: "Взлом",
      unit_id: randomUUID(),
      rate: 1,
      valid_from: "2026-01-01",
    });
    expect(ins.error?.code).toBe("42501");
  });
});
