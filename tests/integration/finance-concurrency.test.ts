import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

import { createCashier, createFixture, must, service, type Fixture } from "./setup";

// Параллельные оплаты одного долга: без двойного списания и без ухода кассы в минус (Д-19, Д-64).
let fx: Fixture;
let cashier: SupabaseClient<Database>;

beforeAll(async () => {
  fx = await createFixture("finance");
  cashier = await createCashier(fx.orgId);
});

async function account(name: string, balance: number): Promise<string> {
  const id = randomUUID();
  must(
    await cashier.rpc("save_cash_account", {
      p_id: id,
      p_org: fx.orgId,
      p_name: `${name} ${id.slice(0, 6)}`,
      p_kind: "CASH",
      p_currency: "TJS",
      p_bank_name: "",
      p_account_number: "",
      p_project_id: null as unknown as string,
      p_is_active: true,
    }),
  );
  if (balance > 0) await post(id, "IN", "OWNER_FUNDS", balance, []);
  return id;
}

/** Обязательство поставщику (как после подтверждения накладной) — напрямую service_role. */
async function payable(amount: number): Promise<string> {
  const row = must(
    await service
      .from("payables")
      .insert({
        organization_id: fx.orgId,
        project_id: fx.projectId,
        counterparty_kind: "SUPPLIER",
        supplier_id: fx.supplierId,
        source_doc_type: "SUPPLIER_INVOICE",
        source_doc_id: randomUUID(),
        amount,
        currency: "TJS",
      })
      .select("id")
      .single(),
  );
  return row.id;
}

async function draft(
  accountId: string,
  dir: "IN" | "OUT",
  category: Database["public"]["Enums"]["cash_category"],
  amount: number,
  allocations: { payable_id: string; amount: number }[],
): Promise<string> {
  const id = randomUUID();
  must(
    await cashier.rpc("save_cash_transaction_draft", {
      p_id: id,
      p_org: fx.orgId,
      p_cash_account_id: accountId,
      p_direction: dir,
      p_category: category,
      p_amount: amount,
      p_project_id: null as unknown as string,
      p_counterparty_supplier_id: (dir === "OUT" ? fx.supplierId : null) as string,
      p_counterparty_crew_id: null as unknown as string,
      p_counterparty_name: "",
      p_basis: "тест",
      p_note: "",
      p_allocations: allocations,
    }),
  );
  return id;
}

async function post(
  accountId: string,
  dir: "IN" | "OUT",
  category: Database["public"]["Enums"]["cash_category"],
  amount: number,
  allocations: { payable_id: string; amount: number }[],
) {
  const id = await draft(accountId, dir, category, amount, allocations);
  return cashier.rpc("post_cash_transaction", { p_id: id, p_key: randomUUID() });
}

async function state(payableId: string, accountIds: string[]) {
  const p = must(
    await service.from("payables").select("amount, paid_amount").eq("id", payableId).single(),
  );
  const accounts = must(
    await service.from("cash_accounts").select("id, balance").in("id", accountIds),
  );
  return {
    remaining: Number(p.amount) - Number(p.paid_amount),
    balances: Object.fromEntries(accounts.map((a) => [a.id, Number(a.balance)])),
  };
}

describe("параллельные оплаты одного долга", () => {
  it("10 оплат по 30 из одной кассы на долг 100 — проходят ровно 3, переплаты нет", async () => {
    const acc = await account("Касса", 1000);
    const debt = await payable(100);
    const ids = await Promise.all(
      Array.from({ length: 10 }, () =>
        draft(acc, "OUT", "SUPPLIER", 30, [{ payable_id: debt, amount: 30 }]),
      ),
    );
    const results = await Promise.all(
      ids.map((id) => cashier.rpc("post_cash_transaction", { p_id: id, p_key: randomUUID() })),
    );

    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(results.filter((r) => r.error).every((r) => r.error?.message === "BF_OVERPAYMENT")).toBe(
      true,
    );
    const s = await state(debt, [acc]);
    expect(s.remaining).toBe(10);
    expect(s.balances[acc]).toBe(910);
  });

  it("оплаты одного долга из двух касс одновременно — без двойного списания", async () => {
    const a = await account("Касса А", 1000);
    const b = await account("Касса Б", 1000);
    const debt = await payable(100);
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        draft(i % 2 ? a : b, "OUT", "SUPPLIER", 30, [{ payable_id: debt, amount: 30 }]),
      ),
    );
    const results = await Promise.all(
      ids.map((id) => cashier.rpc("post_cash_transaction", { p_id: id, p_key: randomUUID() })),
    );

    expect(results.filter((r) => !r.error)).toHaveLength(3);
    const s = await state(debt, [a, b]);
    expect(s.remaining).toBe(10);
    expect(s.balances[a]! + s.balances[b]!).toBe(2000 - 90);
  });

  it("10 повторов с одним ключом — одна оплата", async () => {
    const acc = await account("Касса", 500);
    const debt = await payable(100);
    const id = await draft(acc, "OUT", "SUPPLIER", 40, [{ payable_id: debt, amount: 40 }]);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        cashier.rpc("post_cash_transaction", { p_id: id, p_key: key }),
      ),
    );

    expect(results.every((r) => !r.error)).toBe(true);
    expect(new Set(results.map((r) => (r.data as { number: string }).number)).size).toBe(1);
    const s = await state(debt, [acc]);
    expect(s.remaining).toBe(60);
    expect(s.balances[acc]).toBe(460);
  });

  it("параллельные расходы сверх баланса — касса не уходит в минус", async () => {
    const acc = await account("Касса", 100);
    const debt = await payable(10000);
    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        draft(acc, "OUT", "SUPPLIER", 30, [{ payable_id: debt, amount: 30 }]),
      ),
    );
    const results = await Promise.all(
      ids.map((id) => cashier.rpc("post_cash_transaction", { p_id: id, p_key: randomUUID() })),
    );

    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(
      results.filter((r) => r.error).every((r) => r.error?.message === "BF_NEGATIVE_CASH"),
    ).toBe(true);
    const s = await state(debt, [acc]);
    expect(s.balances[acc]).toBe(10);
    expect(s.remaining).toBe(10000 - 90);
  });

  it("сверка касс и долгов после всех гонок сходится", async () => {
    const { data, error } = await cashier.rpc("check_cash_consistency", { p_org: fx.orgId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("склад и финансы через API", () => {
  it("кассы, операции, распределения, оплаты, счета, долги — пусто; функции закрыты", async () => {
    for (const table of [
      "cash_accounts",
      "cash_transactions",
      "cash_transaction_allocations",
      "payments",
      "payment_requests",
      "payables",
      "opening_cash_items",
      "opening_payable_items",
    ] as const) {
      const { data, error } = await (
        fx.storekeeper.from as (t: string) => ReturnType<typeof fx.storekeeper.from>
      )(table).select("*");
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const consistency = await fx.storekeeper.rpc("check_cash_consistency", { p_org: fx.orgId });
    expect(consistency.error?.message).toBe("BF_FORBIDDEN");
  });
});
